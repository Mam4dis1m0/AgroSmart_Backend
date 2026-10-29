-- Pago por período, jornada de la finca y cosecha ligada a la tarea.
-- Solo AGREGA columnas (y copia un dato existente a la columna nueva). No elimina ni cambia nada.
-- Idempotente: se puede ejecutar más de una vez.

-- ── Empleado: cómo se le paga (por día, semana o mes) y cuánto ──────────────────────────────
-- Las columnas montoporhora / montoporjornal se conservan, pero ya no se usan para pagar ni para costear.
ALTER TABLE public.empleado
  ADD COLUMN IF NOT EXISTS tipopago  varchar(10) NOT NULL DEFAULT 'dia',
  ADD COLUMN IF NOT EXISTS valorpago numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleado_tipopago_chk') THEN
    ALTER TABLE public.empleado
      ADD CONSTRAINT empleado_tipopago_chk CHECK (tipopago IN ('dia', 'semana', 'mes'));
  END IF;
END $$;

-- Quien ya tenía un pago por jornal queda como «pago por día» con ese valor
UPDATE public.empleado
   SET tipopago = 'dia', valorpago = montoporjornal
 WHERE COALESCE(valorpago, 0) = 0 AND COALESCE(montoporjornal, 0) > 0;

-- ── Finca: cómo es un día normal de trabajo ─────────────────────────────────────────────────
-- Con esto y el pago de los empleados se obtiene el costo promedio de una hora de mano de obra.
ALTER TABLE public.finca
  ADD COLUMN IF NOT EXISTS jornadainicio   time    NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS jornadafin      time    NOT NULL DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS jornadadescanso integer NOT NULL DEFAULT 60,   -- minutos de descanso
  ADD COLUMN IF NOT EXISTS jornadapersonas integer;                       -- null = todos los empleados activos

-- ── Cosecha: de qué tarea y de quién salió ──────────────────────────────────────────────────
ALTER TABLE public.cosecha
  ADD COLUMN IF NOT EXISTS idtarea    integer,
  ADD COLUMN IF NOT EXISTS idempleado integer;

CREATE INDEX IF NOT EXISTS ix_cosecha_tarea ON public.cosecha (idtarea);

-- ── Nómina: tipo de pago de cada línea ──────────────────────────────────────────────────────
-- En las líneas nuevas: jornadas = días (o semanas / meses) pagados y valorjornal = valor de cada uno.
ALTER TABLE public.nomina_detalle
  ADD COLUMN IF NOT EXISTS tipopago varchar(10);
