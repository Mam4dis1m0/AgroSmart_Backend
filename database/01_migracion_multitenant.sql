-- =====================================================================
--  AgroSmart — MIGRACIÓN A MULTI-TENANT + CAPA DE NEGOCIO (Supabase / PostgreSQL)
--  Basado en: AgroSmart_Web_Movil_Documento_Combinado.docx
--    EP-09 Marketplace · EP-10 Multi-tenant · EP-11 Nómina/Talent
--    EP-12 Planes SaaS · EP-13 Chat IA · RNF-07/16/19/20
--
--  CÓMO EJECUTARLO
--    1. Supabase → SQL Editor → pega TODO este archivo → Run.
--    2. Es IDEMPOTENTE y NO destructivo: se puede correr más de una vez.
--    3. Si ya tienes datos, se crean automáticamente la finca "Finca Principal"
--       y se asignan a ella todos los datos y usuarios existentes.
--    4. Antes de correrlo, deja vacía la cola offline del backend
--       (.cache/pending-queue.json): sus operaciones viejas no traen idfinca.
--
--  SUPUESTOS QUE DEBES REVISAR (marcados con  -- AJUSTAR  más abajo)
--    · Límites del plan Freemium y precio del Premium (tabla plan).
--    · Comisión del marketplace: 5 % Freemium / 3 % Premium (el doc dice 3–5 %).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Funciones auxiliares
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agro_add_constraint(p_tabla text, p_nombre text, p_ddl text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = p_nombre AND t.relname = p_tabla AND n.nspname = 'public'
  ) THEN
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', p_tabla, p_nombre, p_ddl);
  END IF;
END $$;

-- RNF-07: fecha de actualización automática
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Distancia en km entre dos coordenadas (alertas de ofertas cercanas, CU-34)
CREATE OR REPLACE FUNCTION public.distancia_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN NULL
  ELSE 6371 * 2 * asin(sqrt(
         power(sin(radians((lat2 - lat1)::float8) / 2), 2) +
         cos(radians(lat1::float8)) * cos(radians(lat2::float8)) *
         power(sin(radians((lon2 - lon1)::float8) / 2), 2)
       ))::numeric END
$$;

-- ---------------------------------------------------------------------
-- 1. PLANES SaaS (RF-41, RNF-19) — catálogo controlado (RNF-08)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan (
  idplan                 serial PRIMARY KEY,
  codigo                 varchar(20)  NOT NULL UNIQUE,          -- FREEMIUM | PREMIUM
  nombre                 varchar(60)  NOT NULL,
  descripcion            text,
  preciomensual          numeric(12,2) NOT NULL DEFAULT 0,
  moneda                 varchar(3)   NOT NULL DEFAULT 'COP',
  maxcultivos            integer,                               -- NULL = ilimitado
  maxempleados           integer,                               -- NULL = ilimitado
  maxfincas              integer,                               -- fincas permitidas a un dueño solo con fincas de este plan
  comisionmarketplace    numeric(5,2) NOT NULL DEFAULT 5.00,    -- % retenido por venta (RF-31)
  funciones              jsonb        NOT NULL DEFAULT '{}'::jsonb,
  activo                 boolean      NOT NULL DEFAULT true,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now()
);

-- AJUSTAR: límites, precio y comisiones son valores de ejemplo.
INSERT INTO public.plan (codigo, nombre, descripcion, preciomensual, maxcultivos, maxempleados, maxfincas, comisionmarketplace, funciones)
VALUES
 ('FREEMIUM', 'Freemium',
  'Soporte esencial, crop management básico, registro de cultivos y gastos básicos.',
  0, 3, 3, 1, 5.00,
  '{"soporte_prioritario":false,"nomina":false,"control_insumos_pagos":false,"exportar_excel":false,
    "reportes_avanzados":false,"marketplace_premium":false,"early_access":false,
    "talent_center":false,"chat_ia":false,"offline_completo":false}'::jsonb),
 ('PREMIUM', 'Premium (Plan Pro)',
  'Gestión avanzada ilimitada: nómina, Excel, Talent Center, Chat IA, offline completo y soporte 24/7.',
  49900, NULL, NULL, NULL, 3.00,
  '{"soporte_prioritario":true,"nomina":true,"control_insumos_pagos":true,"exportar_excel":true,
    "reportes_avanzados":true,"marketplace_premium":true,"early_access":true,
    "talent_center":true,"chat_ia":true,"offline_completo":true}'::jsonb)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. USUARIO: campos que pide el documento (RF-01, RNF-03, RNF-11)
-- ---------------------------------------------------------------------
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS cedula      varchar(20);
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS fotoperfil  text;       -- el backend ya la usa
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS activo      boolean     NOT NULL DEFAULT true;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Cédula única, pero permite los usuarios antiguos que aún no la tienen
CREATE UNIQUE INDEX IF NOT EXISTS usuario_cedula_key ON public.usuario (cedula) WHERE cedula IS NOT NULL;

-- Perfil del Comprador Externo del Marketplace (RF-28, RF-30)
CREATE TABLE IF NOT EXISTS public.comprador_perfil (
  idusuario        integer PRIMARY KEY REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  ubicacion        varchar(255),
  latitud          numeric(9,6),
  longitud         numeric(9,6),
  radioalertaskm   integer NOT NULL DEFAULT 50,
  notificaciones   boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. MULTI-TENANT: FINCA + membresía (RF-33, RF-34, CU-35, CU-36)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finca (
  idfinca          serial PRIMARY KEY,
  nombre           varchar(150) NOT NULL,
  ubicacion        varchar(255),
  latitud          numeric(9,6),
  longitud         numeric(9,6),
  tipoproduccion   varchar(100),                                  -- café, arroz, maíz...
  idpropietario    integer NOT NULL REFERENCES public.usuario(idusuario),
  idplan           integer NOT NULL REFERENCES public.plan(idplan),
  planvencimiento  timestamptz,
  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- CU-35: el nombre no se repite para el mismo administrador
CREATE UNIQUE INDEX IF NOT EXISTS finca_propietario_nombre_key ON public.finca (idpropietario, lower(nombre));

-- Qué usuario pertenece a qué finca y con qué rol (un admin puede tener varias fincas)
CREATE TABLE IF NOT EXISTS public.finca_usuario (
  idfincausuario   serial PRIMARY KEY,
  idfinca          integer NOT NULL REFERENCES public.finca(idfinca)     ON DELETE CASCADE,
  idusuario        integer NOT NULL REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  rol              varchar(20) NOT NULL CHECK (rol IN ('admin','empleado')),
  activo           boolean NOT NULL DEFAULT true,
  fechaingreso     date NOT NULL DEFAULT current_date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finca_usuario_unico UNIQUE (idfinca, idusuario)
);

-- Suscripción mensual por finca (RF-42, CU-42)
CREATE TABLE IF NOT EXISTS public.suscripcion (
  idsuscripcion        serial PRIMARY KEY,
  idfinca              integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  idplan               integer NOT NULL REFERENCES public.plan(idplan),
  estado               varchar(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','CANCELADA','VENCIDA')),
  fechainicio          timestamptz NOT NULL DEFAULT now(),
  fechafin             timestamptz,
  renovacionautomatica boolean NOT NULL DEFAULT true,
  idpago               integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
-- Solo una suscripción ACTIVA por finca
CREATE UNIQUE INDEX IF NOT EXISTS suscripcion_activa_unica ON public.suscripcion (idfinca) WHERE estado = 'ACTIVA';

-- Pagos de la plataforma: suscripciones, listados destacados, comisiones (RNF-18)
CREATE TABLE IF NOT EXISTS public.pago (
  idpago             serial PRIMARY KEY,
  idfinca            integer REFERENCES public.finca(idfinca) ON DELETE SET NULL,
  idusuario          integer REFERENCES public.usuario(idusuario) ON DELETE SET NULL,
  tipo               varchar(30) NOT NULL CHECK (tipo IN ('SUSCRIPCION','LISTADO_DESTACADO','COMISION_MARKETPLACE')),
  monto              numeric(12,2) NOT NULL CHECK (monto >= 0),
  moneda             varchar(3) NOT NULL DEFAULT 'COP',
  estado             varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADO','FALLIDO','REEMBOLSADO')),
  proveedor          varchar(50),                                -- wompi, epayco, stripe, SIMULADO...
  referenciaexterna  varchar(150),
  detalle            jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
SELECT public.agro_add_constraint('suscripcion','suscripcion_idpago_fkey','FOREIGN KEY (idpago) REFERENCES public.pago(idpago) ON DELETE SET NULL');

-- ---------------------------------------------------------------------
-- 4. BACKFILL: finca por defecto con todos los datos existentes
-- ---------------------------------------------------------------------
DO $$
DECLARE v_owner integer; v_finca integer; v_plan integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.finca) AND EXISTS (SELECT 1 FROM public.usuario) THEN
    SELECT COALESCE((SELECT MIN(idusuario) FROM public.administrador),
                    (SELECT MIN(idusuario) FROM public.usuario)) INTO v_owner;
    SELECT idplan INTO v_plan FROM public.plan WHERE codigo = 'FREEMIUM';

    INSERT INTO public.finca (nombre, tipoproduccion, idpropietario, idplan)
    VALUES ('Finca Principal', 'Mixta', v_owner, v_plan)
    RETURNING idfinca INTO v_finca;

    INSERT INTO public.finca_usuario (idfinca, idusuario, rol)
    SELECT v_finca, a.idusuario, 'admin' FROM public.administrador a
    ON CONFLICT (idfinca, idusuario) DO NOTHING;

    INSERT INTO public.finca_usuario (idfinca, idusuario, rol)
    SELECT v_finca, e.idusuario, 'empleado' FROM public.empleado e
    WHERE e.idusuario NOT IN (SELECT idusuario FROM public.administrador)
    ON CONFLICT (idfinca, idusuario) DO NOTHING;

    INSERT INTO public.suscripcion (idfinca, idplan, estado) VALUES (v_finca, v_plan, 'ACTIVA');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. idfinca en TODAS las tablas operativas (RNF-16: aislamiento por finca)
--    notificacion y auditoria quedan NULLables (eventos del sistema / de compradores)
-- ---------------------------------------------------------------------
DO $$
DECLARE t text; v_def integer;
BEGIN
  SELECT MIN(idfinca) INTO v_def FROM public.finca;

  FOREACH t IN ARRAY ARRAY['lote','palma','cultivo','produccion_palma','insumo','tarea',
                           'detalle_tarea','asignacion_tarea','empleado_cosecha','notificacion','auditoria']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS idfinca integer', t);
    IF v_def IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET idfinca = %s WHERE idfinca IS NULL', t, v_def);
    END IF;
    PERFORM public.agro_add_constraint(t, t || '_idfinca_fkey',
      'FOREIGN KEY (idfinca) REFERENCES public.finca(idfinca) ON DELETE CASCADE');
    IF t NOT IN ('notificacion','auditoria') THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN idfinca SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. Columnas nuevas en tablas existentes
-- ---------------------------------------------------------------------
-- Cultivo: el documento pide "tipo" y estado activo (CU-05, CU-07)
ALTER TABLE public.cultivo ADD COLUMN IF NOT EXISTS tipo   varchar(100);
ALTER TABLE public.cultivo ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- Notificación dirigida a un usuario (empleado asignado, comprador cercano...)
ALTER TABLE public.notificacion ADD COLUMN IF NOT EXISTS idusuariodestino integer REFERENCES public.usuario(idusuario) ON DELETE CASCADE;
ALTER TABLE public.notificacion ADD COLUMN IF NOT EXISTS titulo varchar(150);

-- Auditoría: quién hizo la acción (RNF-07, CU-22)
ALTER TABLE public.auditoria ADD COLUMN IF NOT EXISTS idusuario integer REFERENCES public.usuario(idusuario) ON DELETE SET NULL;

-- RNF-07: fechas de creación/actualización en las tablas operativas
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lote','palma','cultivo','produccion_palma','insumo','tarea',
                           'detalle_tarea','asignacion_tarea','empleado_cosecha']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
  END LOOP;
END $$;

-- Claves únicas (id, idfinca) en tablas padre: permiten FKs compuestas que
-- impiden a nivel de BD mezclar datos de fincas distintas (RNF-16).
SELECT public.agro_add_constraint('lote',    'lote_id_finca_key',    'UNIQUE (idlote, idfinca)');
SELECT public.agro_add_constraint('palma',   'palma_id_finca_key',   'UNIQUE (idpalma, idfinca)');
SELECT public.agro_add_constraint('cultivo', 'cultivo_id_finca_key', 'UNIQUE (idcultivo, idfinca)');
SELECT public.agro_add_constraint('tarea',   'tarea_id_finca_key',   'UNIQUE (idtarea, idfinca)');
SELECT public.agro_add_constraint('insumo',  'insumo_id_finca_key',  'UNIQUE (idinsumo, idfinca)');

SELECT public.agro_add_constraint('cultivo','fk_cultivo_lote_finca',
  'FOREIGN KEY (idlote, idfinca) REFERENCES public.lote(idlote, idfinca)');
SELECT public.agro_add_constraint('palma','fk_palma_lote_finca',
  'FOREIGN KEY (idlote, idfinca) REFERENCES public.lote(idlote, idfinca)');
SELECT public.agro_add_constraint('produccion_palma','fk_prodpalma_lote_finca',
  'FOREIGN KEY (idlote, idfinca) REFERENCES public.lote(idlote, idfinca)');
SELECT public.agro_add_constraint('produccion_palma','fk_prodpalma_palma_finca',
  'FOREIGN KEY (idpalma, idfinca) REFERENCES public.palma(idpalma, idfinca)');
SELECT public.agro_add_constraint('tarea','fk_tarea_cultivo_finca',
  'FOREIGN KEY (idcultivo, idfinca) REFERENCES public.cultivo(idcultivo, idfinca)');
SELECT public.agro_add_constraint('asignacion_tarea','fk_asigtarea_tarea_finca',
  'FOREIGN KEY (idtarea, idfinca) REFERENCES public.tarea(idtarea, idfinca)');
SELECT public.agro_add_constraint('detalle_tarea','fk_dettarea_tarea_finca',
  'FOREIGN KEY (idtarea, idfinca) REFERENCES public.tarea(idtarea, idfinca)');
SELECT public.agro_add_constraint('detalle_tarea','fk_dettarea_insumo_finca',
  'FOREIGN KEY (idinsumo, idfinca) REFERENCES public.insumo(idinsumo, idfinca)');

-- ---------------------------------------------------------------------
-- 7. Cosechas y compras de insumos (CU-15, CU-16)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cosecha (
  idcosecha        serial PRIMARY KEY,
  idfinca          integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  idcultivo        integer NOT NULL,
  fechacosecha     date NOT NULL,
  cantidad         numeric(12,2) NOT NULL CHECK (cantidad >= 0),
  unidad           varchar(20) NOT NULL DEFAULT 'kg',
  calidad          varchar(50),
  observaciones    text,
  idadminregistro  integer REFERENCES public.usuario(idusuario) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cosecha_id_finca_key UNIQUE (idcosecha, idfinca),
  CONSTRAINT fk_cosecha_cultivo_finca FOREIGN KEY (idcultivo, idfinca) REFERENCES public.cultivo(idcultivo, idfinca)
);

CREATE TABLE IF NOT EXISTS public.compra_insumo (
  idcompra         serial PRIMARY KEY,
  idfinca          integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  idinsumo         integer NOT NULL,
  cantidad         numeric(12,2) NOT NULL CHECK (cantidad > 0),
  costounitario    numeric(12,2) NOT NULL CHECK (costounitario >= 0),
  costototal       numeric(14,2) GENERATED ALWAYS AS (cantidad * costounitario) STORED,
  fechacompra      date NOT NULL DEFAULT current_date,
  proveedor        varchar(150),
  idadminregistro  integer REFERENCES public.usuario(idusuario) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_compra_insumo_finca FOREIGN KEY (idinsumo, idfinca) REFERENCES public.insumo(idinsumo, idfinca)
);

-- ---------------------------------------------------------------------
-- 8. MARKETPLACE "MarketFields" (EP-09)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listado (
  idlistado          serial PRIMARY KEY,
  idfinca            integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  idvendedor         integer NOT NULL REFERENCES public.usuario(idusuario),
  idcosecha          integer,
  titulo             varchar(150) NOT NULL,
  descripcion        text,
  categoria          varchar(60),
  volumeninicial     numeric(12,2) NOT NULL CHECK (volumeninicial >= 0),
  volumendisponible  numeric(12,2) NOT NULL CHECK (volumendisponible >= 0),
  unidad             varchar(20) NOT NULL DEFAULT 'kg',
  preciounitario     numeric(12,2) NOT NULL CHECK (preciounitario >= 0),   -- precio de oportunidad
  moneda             varchar(3) NOT NULL DEFAULT 'COP',
  ubicacion          varchar(255),
  latitud            numeric(9,6),
  longitud           numeric(9,6),
  estado             varchar(20) NOT NULL DEFAULT 'PUBLICADO' CHECK (estado IN ('BORRADOR','PUBLICADO','PAUSADO','AGOTADO')),
  destacado          boolean NOT NULL DEFAULT false,                        -- Upsell (RF-32)
  destacadohasta     timestamptz,
  earlyaccesshasta   timestamptz,                                           -- Premium: lo ven antes (RF-43)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listado_id_finca_key UNIQUE (idlistado, idfinca),
  CONSTRAINT fk_listado_cosecha_finca FOREIGN KEY (idcosecha, idfinca) REFERENCES public.cosecha(idcosecha, idfinca)
);

CREATE TABLE IF NOT EXISTS public.listado_foto (
  idfoto      serial PRIMARY KEY,
  idlistado   integer NOT NULL REFERENCES public.listado(idlistado) ON DELETE CASCADE,
  url         text NOT NULL,                                                -- Cloudinary
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Orden de compra; idfinca = finca VENDEDORA (el comprador no pertenece a ninguna finca)
CREATE TABLE IF NOT EXISTS public.orden_compra (
  idorden             serial PRIMARY KEY,
  idfinca             integer NOT NULL REFERENCES public.finca(idfinca),
  idlistado           integer NOT NULL REFERENCES public.listado(idlistado),
  idcomprador         integer NOT NULL REFERENCES public.usuario(idusuario),
  cantidad            numeric(12,2) NOT NULL CHECK (cantidad > 0),
  preciounitario      numeric(12,2) NOT NULL CHECK (preciounitario >= 0),
  subtotal            numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  comisionporcentaje  numeric(5,2)  NOT NULL CHECK (comisionporcentaje BETWEEN 0 AND 100),
  comisionvalor       numeric(14,2) NOT NULL CHECK (comisionvalor >= 0),
  netovendedor        numeric(14,2) NOT NULL CHECK (netovendedor >= 0),
  estado              varchar(20) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','ACEPTADA','RECHAZADA','CERRADA','CANCELADA')),
  puntoentrega        varchar(255),
  notas               text,
  fechaaceptacion     timestamptz,
  fechacierre         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Carrito y wishlist (Premium, CU-46)
CREATE TABLE IF NOT EXISTS public.carrito_item (
  idcarritoitem  serial PRIMARY KEY,
  idusuario      integer NOT NULL REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  idlistado      integer NOT NULL REFERENCES public.listado(idlistado) ON DELETE CASCADE,
  cantidad       numeric(12,2) NOT NULL CHECK (cantidad > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carrito_item_unico UNIQUE (idusuario, idlistado)
);
CREATE TABLE IF NOT EXISTS public.wishlist_item (
  idwishlistitem serial PRIMARY KEY,
  idusuario      integer NOT NULL REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  idlistado      integer NOT NULL REFERENCES public.listado(idlistado) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlist_item_unico UNIQUE (idusuario, idlistado)
);

-- Anuncios de proveedores de insumos (RF-45, CU-44)
CREATE TABLE IF NOT EXISTS public.anunciante (
  idanunciante serial PRIMARY KEY,
  nombre       varchar(150) NOT NULL,
  contacto     varchar(150),
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.anuncio (
  idanuncio    serial PRIMARY KEY,
  idanunciante integer NOT NULL REFERENCES public.anunciante(idanunciante) ON DELETE CASCADE,
  titulo       varchar(150) NOT NULL,
  descripcion  text,
  imagenurl    text,
  urldestino   text,
  espacio      varchar(30) NOT NULL DEFAULT 'HOME' CHECK (espacio IN ('HOME','INVENTARIO','MARKETPLACE')),
  activo       boolean NOT NULL DEFAULT true,
  fechainicio  date,
  fechafin     date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.anuncio_impresion (
  idimpresion  bigserial PRIMARY KEY,
  idanuncio    integer NOT NULL REFERENCES public.anuncio(idanuncio) ON DELETE CASCADE,
  idusuario    integer REFERENCES public.usuario(idusuario) ON DELETE SET NULL,
  idfinca      integer REFERENCES public.finca(idfinca)     ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 9. NÓMINA y TALENT CENTER (EP-11, Premium)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nomina (
  idnomina     serial PRIMARY KEY,
  idfinca      integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  fechainicio  date NOT NULL,
  fechafin     date NOT NULL,
  estado       varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','CONFIRMADA','PAGADA')),
  total        numeric(14,2) NOT NULL DEFAULT 0,
  idadmin      integer REFERENCES public.usuario(idusuario) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nomina_periodo_valido CHECK (fechafin >= fechainicio),
  CONSTRAINT nomina_id_finca_key UNIQUE (idnomina, idfinca)
);
CREATE TABLE IF NOT EXISTS public.nomina_detalle (
  idnominadetalle serial PRIMARY KEY,
  idnomina        integer NOT NULL REFERENCES public.nomina(idnomina) ON DELETE CASCADE,
  idempleado      integer NOT NULL REFERENCES public.empleado(idusuario),
  horas           numeric(10,2) NOT NULL DEFAULT 0 CHECK (horas >= 0),
  jornadas        numeric(10,2) NOT NULL DEFAULT 0 CHECK (jornadas >= 0),
  valorhora       numeric(12,2) NOT NULL DEFAULT 0,
  valorjornal     numeric(12,2) NOT NULL DEFAULT 0,
  bruto           numeric(14,2) NOT NULL DEFAULT 0,
  deducciones     numeric(14,2) NOT NULL DEFAULT 0,
  neto            numeric(14,2) NOT NULL DEFAULT 0,
  pagado          boolean NOT NULL DEFAULT false,
  fechapago       date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nomina_detalle_unico UNIQUE (idnomina, idempleado)
);

-- Perfiles públicos de personal especializado (no pertenecen a una finca)
CREATE TABLE IF NOT EXISTS public.perfil_talento (
  idperfil          serial PRIMARY KEY,
  idusuario         integer NOT NULL UNIQUE REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  especialidad      varchar(100) NOT NULL,
  descripcion       text,
  experienciaanios  integer CHECK (experienciaanios >= 0),
  tarifahora        numeric(10,2) CHECK (tarifahora >= 0),
  ubicacion         varchar(255),
  disponible        boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.solicitud_contratacion (
  idsolicitud   serial PRIMARY KEY,
  idfinca       integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  idperfil      integer NOT NULL REFERENCES public.perfil_talento(idperfil) ON DELETE CASCADE,
  idadmin       integer REFERENCES public.usuario(idusuario) ON DELETE SET NULL,
  mensaje       text,
  estado        varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACEPTADA','RECHAZADA','CANCELADA')),
  respondida_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 10. CHAT: asistente IA (RF-44) y chat interno offline (1.5.8)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_conversacion (
  idconversacion serial PRIMARY KEY,
  idfinca        integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  idusuario      integer NOT NULL REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  titulo         varchar(150),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chat_mensaje (
  idmensaje      bigserial PRIMARY KEY,
  idconversacion integer NOT NULL REFERENCES public.chat_conversacion(idconversacion) ON DELETE CASCADE,
  rol            varchar(10) NOT NULL CHECK (rol IN ('user','assistant','system')),
  contenido      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mensaje_interno (
  idmensaje       bigserial PRIMARY KEY,
  idfinca         integer NOT NULL REFERENCES public.finca(idfinca) ON DELETE CASCADE,
  idremitente     integer NOT NULL REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  iddestinatario  integer REFERENCES public.usuario(idusuario) ON DELETE CASCADE,  -- NULL = toda la finca
  contenido       text NOT NULL,
  estado          varchar(10) NOT NULL DEFAULT 'ENVIADO' CHECK (estado IN ('PENDIENTE','ENVIADO','LEIDO')),
  creadooffline   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  leido_at        timestamptz
);

-- ---------------------------------------------------------------------
-- 11. Triggers
-- ---------------------------------------------------------------------
-- 11.a updated_at automático en toda tabla que lo tenga
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || r.table_name || '_updated_at') THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at()',
        'trg_' || r.table_name || '_updated_at', r.table_name);
    END IF;
  END LOOP;
END $$;

-- 11.b Si algún trigger/proceso antiguo inserta en auditoria o notificacion sin idfinca,
--      se deduce desde el registro origen (tabla + id), para no perder el aislamiento.
CREATE OR REPLACE FUNCTION public.fn_autocompletar_idfinca()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_tabla text; v_pk text; v_finca integer;
BEGIN
  IF NEW.idfinca IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'auditoria' THEN v_tabla := lower(NEW.tabla_nombre);
  ELSE v_tabla := lower(NEW.tabla_origen);
  END IF;

  v_pk := CASE v_tabla
    WHEN 'lote' THEN 'idlote'
    WHEN 'palma' THEN 'idpalma'
    WHEN 'cultivo' THEN 'idcultivo'
    WHEN 'produccion_palma' THEN 'idproduccionpalma'
    WHEN 'insumo' THEN 'idinsumo'
    WHEN 'tarea' THEN 'idtarea'
    WHEN 'detalle_tarea' THEN 'iddetalletarea'
    WHEN 'asignacion_tarea' THEN 'idasigtarea'
    WHEN 'empleado_cosecha' THEN 'idempleadocosecha'
    ELSE NULL END;

  IF v_pk IS NOT NULL AND NEW.idregistro IS NOT NULL THEN
    BEGIN
      EXECUTE format('SELECT idfinca FROM public.%I WHERE %I = $1', v_tabla, v_pk)
        INTO v_finca USING NEW.idregistro;
      NEW.idfinca := v_finca;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- nunca bloquear la operación original por la auditoría
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auditoria_idfinca ON public.auditoria;
CREATE TRIGGER trg_auditoria_idfinca BEFORE INSERT ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.fn_autocompletar_idfinca();
DROP TRIGGER IF EXISTS trg_notificacion_idfinca ON public.notificacion;
CREATE TRIGGER trg_notificacion_idfinca BEFORE INSERT ON public.notificacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_autocompletar_idfinca();

-- ---------------------------------------------------------------------
-- 12. Reglas de validación (RNF-04, RNF-05) — NOT VALID: solo filas nuevas/modificadas,
--     así no fallan por datos históricos. Ejecuta VALIDATE CONSTRAINT cuando los limpies.
-- ---------------------------------------------------------------------
SELECT public.agro_add_constraint('insumo','insumo_stock_no_negativo',
  'CHECK (stockactual >= 0 AND stockminimo >= 0 AND costounitario >= 0) NOT VALID');
SELECT public.agro_add_constraint('asignacion_tarea','asigtarea_horas_no_negativas',
  'CHECK (horastrabajadas >= 0 AND jornadastrabajadas >= 0) NOT VALID');
SELECT public.agro_add_constraint('cultivo','cultivo_fechas_coherentes',
  'CHECK (fechacosechaestimada IS NULL OR fechasiembra IS NULL OR fechacosechaestimada >= fechasiembra) NOT VALID');
SELECT public.agro_add_constraint('empleado','empleado_montos_no_negativos',
  'CHECK (montoporhora >= 0 AND montoporjornal >= 0) NOT VALID');

-- ---------------------------------------------------------------------
-- 13. Índices
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_finca_propietario        ON public.finca (idpropietario);
CREATE INDEX IF NOT EXISTS idx_finca_usuario_usuario    ON public.finca_usuario (idusuario);
CREATE INDEX IF NOT EXISTS idx_lote_finca               ON public.lote (idfinca);
CREATE INDEX IF NOT EXISTS idx_palma_finca              ON public.palma (idfinca);
CREATE INDEX IF NOT EXISTS idx_cultivo_finca            ON public.cultivo (idfinca);
CREATE INDEX IF NOT EXISTS idx_produccion_palma_finca   ON public.produccion_palma (idfinca);
CREATE INDEX IF NOT EXISTS idx_insumo_finca             ON public.insumo (idfinca);
CREATE INDEX IF NOT EXISTS idx_tarea_finca_estado       ON public.tarea (idfinca, estado);
CREATE INDEX IF NOT EXISTS idx_detalle_tarea_finca      ON public.detalle_tarea (idfinca);
CREATE INDEX IF NOT EXISTS idx_asignacion_tarea_finca   ON public.asignacion_tarea (idfinca);
CREATE INDEX IF NOT EXISTS idx_asignacion_tarea_emp     ON public.asignacion_tarea (idempleado);
CREATE INDEX IF NOT EXISTS idx_empleado_cosecha_finca   ON public.empleado_cosecha (idfinca);
CREATE INDEX IF NOT EXISTS idx_notificacion_finca       ON public.notificacion (idfinca);
CREATE INDEX IF NOT EXISTS idx_notificacion_destino     ON public.notificacion (idusuariodestino, leida);
CREATE INDEX IF NOT EXISTS idx_auditoria_finca          ON public.auditoria (idfinca, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cosecha_finca            ON public.cosecha (idfinca, idcultivo);
CREATE INDEX IF NOT EXISTS idx_compra_insumo_finca      ON public.compra_insumo (idfinca, idinsumo);
CREATE INDEX IF NOT EXISTS idx_listado_catalogo         ON public.listado (estado, destacado DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listado_finca            ON public.listado (idfinca);
CREATE INDEX IF NOT EXISTS idx_orden_finca              ON public.orden_compra (idfinca, estado);
CREATE INDEX IF NOT EXISTS idx_orden_comprador          ON public.orden_compra (idcomprador);
CREATE INDEX IF NOT EXISTS idx_nomina_finca             ON public.nomina (idfinca, fechainicio);
CREATE INDEX IF NOT EXISTS idx_solicitud_finca          ON public.solicitud_contratacion (idfinca, estado);
CREATE INDEX IF NOT EXISTS idx_chat_conv_usuario        ON public.chat_conversacion (idfinca, idusuario);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv            ON public.chat_mensaje (idconversacion, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_interno_finca        ON public.mensaje_interno (idfinca, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pago_finca               ON public.pago (idfinca, tipo);

-- ---------------------------------------------------------------------
-- 14. Seguridad: Row Level Security en TODAS las tablas de public
--     Supabase expone public por la API REST con la anon key; sin RLS cualquiera
--     podría leer usuario.contrasena. Sin políticas = la API REST queda cerrada.
--     El backend NestJS conecta con el rol postgres (BYPASSRLS), por eso NO se afecta:
--     el aislamiento por finca lo aplica el backend (guard + filtros idfinca) y
--     las FKs compuestas de arriba lo respaldan en la BD.
--     Para revertir una tabla:  ALTER TABLE public.<tabla> DISABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.agro_add_constraint(text, text, text);

COMMIT;

-- ---------------------------------------------------------------------
-- Verificación rápida (opcional, corre por separado):
--   SELECT * FROM public.plan;
--   SELECT f.idfinca, f.nombre, count(fu.*) AS miembros FROM finca f LEFT JOIN finca_usuario fu USING (idfinca) GROUP BY 1,2;
--   SELECT count(*) FROM tarea WHERE idfinca IS NULL;   -- debe dar 0
-- ---------------------------------------------------------------------
