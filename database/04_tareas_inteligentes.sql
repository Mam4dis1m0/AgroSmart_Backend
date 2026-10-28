-- Tareas y asignaciones inteligentes: plantillas de labores por tipo de cultivo, tiempos reales,
-- recurrencia, asignación sugerida y evidencia persistente.
-- Solo AGREGA (columnas / tablas / datos base). No elimina ni modifica nada existente.
-- Idempotente: se puede ejecutar más de una vez.

-- ── Cultivo: categoría de manejo (agrupa tipos con el mismo trato agronómico) ───────────────
ALTER TABLE public.cultivo
  ADD COLUMN IF NOT EXISTS categoria varchar(40);

-- ── Finca: cómo se asignan las tareas (manual | sugerida | automatica) ──────────────────────
ALTER TABLE public.finca
  ADD COLUMN IF NOT EXISTS modoasignacion varchar(20) NOT NULL DEFAULT 'sugerida';

-- ── Tarea ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tarea
  ADD COLUMN IF NOT EXISTS idplantilla    integer,
  ADD COLUMN IF NOT EXISTS idtareaorigen  integer,                     -- cadena de recurrencia
  ADD COLUMN IF NOT EXISTS prioridad      varchar(10) NOT NULL DEFAULT 'Media',
  ADD COLUMN IF NOT EXISTS fechainicio    timestamp,
  ADD COLUMN IF NOT EXISTS fechafin       timestamp,
  ADD COLUMN IF NOT EXISTS horasestimadas numeric(10,2),
  ADD COLUMN IF NOT EXISTS costoreal      numeric(12,2),
  ADD COLUMN IF NOT EXISTS generadaauto   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS etapa          varchar(50);

CREATE INDEX IF NOT EXISTS ix_tarea_origen    ON public.tarea (idtareaorigen);
CREATE INDEX IF NOT EXISTS ix_tarea_plantilla ON public.tarea (idplantilla);

-- ── Asignación: tiempos reales y de dónde salió la asignación ───────────────────────────────
ALTER TABLE public.asignacion_tarea
  ADD COLUMN IF NOT EXISTS fechainicio      timestamp,
  ADD COLUMN IF NOT EXISTS fechafin         timestamp,
  ADD COLUMN IF NOT EXISTS origenasignacion varchar(20);                 -- manual | sugerida | automatica

-- ── Plantillas de labores ───────────────────────────────────────────────────────────────────
-- idfinca NULL = catálogo base de AgroSmart. Cada finca trabaja con su propia COPIA editable.
CREATE TABLE IF NOT EXISTS public.plantilla_labor (
  idplantilla     SERIAL PRIMARY KEY,
  idfinca         integer NULL REFERENCES public.finca (idfinca),
  idplantillabase integer NULL,                                      -- plantilla base de la que se copió
  categoria       varchar(40) NOT NULL,
  tipocultivo     varchar(100) NULL,                                 -- más específico que la categoría
  actividad       varchar(50) NOT NULL,
  etapa           varchar(50) NULL,
  base            varchar(20) NOT NULL DEFAULT 'siembra'
                  CHECK (base IN ('siembra', 'cosecha_estimada', 'inicio')),
  diasoffset      integer NOT NULL DEFAULT 0,                        -- días respecto de la base (puede ser negativo)
  esrecurrente    boolean NOT NULL DEFAULT false,
  frecuenciadias  integer NULL,
  diasfin         integer NULL,                                      -- repetir hasta N días después de la base
  horasestimadas  numeric(10,2) NULL,
  numpersonas     integer NOT NULL DEFAULT 1,
  prioridad       varchar(10) NOT NULL DEFAULT 'Media',
  modalidadpago   varchar(10) NOT NULL DEFAULT 'tiempo' CHECK (modalidadpago IN ('tiempo', 'fijo')),
  activa          boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS ix_plantilla_finca     ON public.plantilla_labor (idfinca, categoria);
CREATE INDEX IF NOT EXISTS ix_plantilla_categoria ON public.plantilla_labor (categoria) WHERE idfinca IS NULL;

CREATE TABLE IF NOT EXISTS public.plantilla_labor_insumo (
  idplantillainsumo SERIAL PRIMARY KEY,
  idplantilla       integer NOT NULL REFERENCES public.plantilla_labor (idplantilla),
  idinsumo          integer NULL REFERENCES public.insumo (idinsumo),   -- insumo concreto de la finca (opcional)
  tipoinsumo        varchar(100) NULL,                                  -- o solo el tipo (fertilizante, herbicida…)
  cantidadsugerida  numeric(10,2) NULL,
  unidad            varchar(30) NULL
);

CREATE INDEX IF NOT EXISTS ix_plantilla_insumo ON public.plantilla_labor_insumo (idplantilla);

-- ── Evidencia fotográfica de una tarea ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tarea_evidencia (
  idevidencia   SERIAL PRIMARY KEY,
  idfinca       integer NOT NULL REFERENCES public.finca (idfinca),
  idtarea       integer NOT NULL REFERENCES public.tarea (idtarea),
  idasigtarea   integer NULL REFERENCES public.asignacion_tarea (idasigtarea),
  idusuario     integer NULL REFERENCES public.usuario (idusuario),
  url           text NOT NULL,
  observaciones text NULL,
  fecha         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_evidencia_tarea ON public.tarea_evidencia (idtarea);

-- ── Catálogo base (solo si aún no existe) ───────────────────────────────────────────────────
-- Las cifras son puntos de partida razonables; cada finca las ajusta en su copia.
INSERT INTO public.plantilla_labor
  (idfinca, categoria, actividad, etapa, base, diasoffset, esrecurrente, frecuenciadias, diasfin,
   horasestimadas, numpersonas, prioridad, modalidadpago)
SELECT NULL, v.categoria, v.actividad, v.etapa, v.base, v.diasoffset, v.esrecurrente, v.frecuenciadias,
       v.diasfin, v.horas, v.personas, v.prioridad, v.modalidad
FROM (VALUES
  -- Ciclo corto (maíz, arroz, fríjol)
  ('ciclo_corto','Preparación del suelo','Preparación','siembra',-7,false,NULL::int,NULL::int,8.0,2,'Alta','tiempo'),
  ('ciclo_corto','Siembra','Siembra','siembra',0,false,NULL,NULL,8.0,3,'Alta','tiempo'),
  ('ciclo_corto','Fertilización','Crecimiento','siembra',20,false,NULL,NULL,4.0,1,'Media','tiempo'),
  ('ciclo_corto','Control de malezas','Crecimiento','siembra',25,true,20,80,6.0,2,'Media','tiempo'),
  ('ciclo_corto','Control de plagas y enfermedades','Crecimiento','siembra',30,true,15,90,3.0,1,'Media','tiempo'),
  ('ciclo_corto','Riego','Crecimiento','siembra',3,true,4,90,2.0,1,'Media','tiempo'),
  ('ciclo_corto','Cosecha','Cosecha','cosecha_estimada',0,false,NULL,NULL,16.0,5,'Alta','fijo'),
  -- Hortalizas
  ('hortaliza','Preparación de camas','Preparación','siembra',-5,false,NULL,NULL,6.0,2,'Alta','tiempo'),
  ('hortaliza','Siembra / trasplante','Siembra','siembra',0,false,NULL,NULL,6.0,2,'Alta','tiempo'),
  ('hortaliza','Riego','Crecimiento','siembra',1,true,2,60,1.5,1,'Alta','tiempo'),
  ('hortaliza','Fertilización','Crecimiento','siembra',15,true,15,60,2.0,1,'Media','tiempo'),
  ('hortaliza','Control de plagas y enfermedades','Crecimiento','siembra',10,true,7,60,2.0,1,'Alta','tiempo'),
  ('hortaliza','Deshierba','Crecimiento','siembra',14,true,10,60,3.0,1,'Media','tiempo'),
  ('hortaliza','Cosecha','Cosecha','cosecha_estimada',0,false,NULL,NULL,8.0,3,'Alta','fijo'),
  -- Perennes arbóreos (café, cacao, aguacate, mango, cítricos)
  ('perenne_arboreo','Plateo y limpieza','Mantenimiento','inicio',0,true,45,365,8.0,2,'Media','tiempo'),
  ('perenne_arboreo','Fertilización','Mantenimiento','inicio',15,true,120,365,6.0,2,'Alta','tiempo'),
  ('perenne_arboreo','Poda de formación y sanitaria','Mantenimiento','inicio',30,true,180,365,8.0,2,'Media','tiempo'),
  ('perenne_arboreo','Control de plagas y enfermedades','Mantenimiento','inicio',20,true,30,365,4.0,1,'Alta','tiempo'),
  ('perenne_arboreo','Cosecha / recolección','Cosecha','cosecha_estimada',0,false,NULL,NULL,24.0,6,'Alta','fijo'),
  ('perenne_arboreo','Beneficio / postcosecha','Postcosecha','cosecha_estimada',2,false,NULL,NULL,8.0,2,'Media','tiempo'),
  -- Palma de aceite
  ('palma','Plateo y control de malezas','Mantenimiento','inicio',0,true,60,365,8.0,2,'Media','tiempo'),
  ('palma','Fertilización','Mantenimiento','inicio',15,true,120,365,8.0,2,'Alta','tiempo'),
  ('palma','Poda de hojas','Mantenimiento','inicio',30,true,90,365,8.0,2,'Media','tiempo'),
  ('palma','Control de plagas y enfermedades','Mantenimiento','inicio',20,true,30,365,4.0,1,'Alta','tiempo'),
  ('palma','Cosecha de racimos','Cosecha','inicio',10,true,10,365,16.0,4,'Alta','fijo'),
  -- Caña de azúcar
  ('cana','Preparación del suelo','Preparación','siembra',-10,false,NULL,NULL,12.0,2,'Alta','tiempo'),
  ('cana','Siembra','Siembra','siembra',0,false,NULL,NULL,16.0,4,'Alta','fijo'),
  ('cana','Fertilización','Crecimiento','siembra',45,false,NULL,NULL,6.0,2,'Media','tiempo'),
  ('cana','Control de malezas','Crecimiento','siembra',30,true,45,270,8.0,2,'Media','tiempo'),
  ('cana','Riego','Crecimiento','siembra',7,true,10,270,3.0,1,'Media','tiempo'),
  ('cana','Corte y cosecha','Cosecha','cosecha_estimada',0,false,NULL,NULL,24.0,6,'Alta','fijo'),
  -- Plátano y yuca (semipermanentes / tubérculos)
  ('semipermanente','Preparación y siembra','Siembra','siembra',0,false,NULL,NULL,10.0,3,'Alta','tiempo'),
  ('semipermanente','Fertilización','Crecimiento','siembra',30,true,90,360,4.0,1,'Media','tiempo'),
  ('semipermanente','Control de malezas','Crecimiento','siembra',20,true,40,360,6.0,2,'Media','tiempo'),
  ('semipermanente','Deshije / poda','Crecimiento','siembra',60,true,60,360,4.0,1,'Media','tiempo'),
  ('semipermanente','Control de plagas y enfermedades','Crecimiento','siembra',25,true,30,360,3.0,1,'Media','tiempo'),
  ('semipermanente','Cosecha','Cosecha','cosecha_estimada',0,false,NULL,NULL,16.0,4,'Alta','fijo'),
  -- Pastos
  ('pastos','Siembra / resiembra de pasto','Siembra','siembra',0,false,NULL,NULL,10.0,3,'Media','tiempo'),
  ('pastos','Control de malezas','Mantenimiento','inicio',30,true,60,365,6.0,2,'Media','tiempo'),
  ('pastos','Fertilización','Mantenimiento','inicio',15,true,90,365,4.0,1,'Media','tiempo'),
  ('pastos','Rotación de potreros','Mantenimiento','inicio',7,true,14,365,2.0,1,'Media','tiempo'),
  ('pastos','Corte / henificación','Mantenimiento','inicio',45,true,60,365,8.0,2,'Media','tiempo')
) AS v(categoria, actividad, etapa, base, diasoffset, esrecurrente, frecuenciadias, diasfin,
       horas, personas, prioridad, modalidad)
WHERE NOT EXISTS (SELECT 1 FROM public.plantilla_labor WHERE idfinca IS NULL);

-- Insumos que normalmente consume cada tipo de labor (solo el tipo; la cantidad la define quien la ejecuta)
INSERT INTO public.plantilla_labor_insumo (idplantilla, tipoinsumo, unidad)
SELECT p.idplantilla, m.tipoinsumo, m.unidad
FROM public.plantilla_labor p
JOIN (VALUES
  ('Fertilización',                     'Fertilizante', 'kg'),
  ('Control de plagas y enfermedades',  'Plaguicida',   'L'),
  ('Control de malezas',                'Herbicida',    'L'),
  ('Plateo y control de malezas',       'Herbicida',    'L'),
  ('Plateo y limpieza',                 'Herbicida',    'L')
) AS m(actividad, tipoinsumo, unidad) ON m.actividad = p.actividad
WHERE p.idfinca IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.plantilla_labor_insumo);
