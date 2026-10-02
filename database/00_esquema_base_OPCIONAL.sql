-- =====================================================================
--  AgroSmart — ESQUEMA BASE (las 14 tablas que ya tenía el backend)
--
--  ¡OPCIONAL! Úsalo SOLO si tu Supabase está VACÍO (proyecto nuevo).
--  Si ya tienes estas tablas con datos, NO lo necesitas: salta directo a
--  01_migracion_multitenant.sql. Todo usa IF NOT EXISTS, así que correrlo
--  sobre una BD existente no cambia nada, pero tampoco la "arregla".
--
--  Reconstruido a partir de src/Entidades/entities/*.ts. Orden correcto de ejecución:
--    1) este archivo   2) 01_migracion_multitenant.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.usuario (
  idusuario        serial PRIMARY KEY,
  primernombre     varchar(100),
  segundonombre    varchar(100),
  primerapellido   varchar(100),
  segundoapellido  varchar(100),
  email            varchar(150) UNIQUE,
  contrasena       varchar(255),
  telefono         varchar(20)
);

CREATE TABLE IF NOT EXISTS public.administrador (
  idusuario     integer PRIMARY KEY REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  montomensual  numeric(10,2)
);

CREATE TABLE IF NOT EXISTS public.empleado (
  idusuario       integer PRIMARY KEY REFERENCES public.usuario(idusuario) ON DELETE CASCADE,
  montoporhora    numeric(10,2),
  montoporjornal  numeric(10,2)
);

CREATE TABLE IF NOT EXISTS public.lote (
  idlote         serial PRIMARY KEY,
  nombre         varchar(100),
  areahectareas  numeric(10,2),
  ubicacion      varchar(255),
  descripcion    text,
  activo         boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.palma (
  idpalma          serial PRIMARY KEY,
  codigo           varchar(100),
  variedad         varchar(100),
  fechasiembra     date,
  estadosanitario  varchar(50),
  observaciones    text,
  idlote           integer REFERENCES public.lote(idlote)
);

CREATE TABLE IF NOT EXISTS public.cultivo (
  idcultivo             serial PRIMARY KEY,
  nombrelote            varchar(100),
  fechasiembra          date,
  fechacosechaestimada  date,
  alertan8n             text,
  idadminsupervisor     integer REFERENCES public.administrador(idusuario),
  idlote                integer REFERENCES public.lote(idlote)
);

CREATE TABLE IF NOT EXISTS public.produccion_palma (
  idproduccionpalma  serial PRIMARY KEY,
  fecharegistro      date,
  cantidadracimos    integer,
  pesokg             numeric(10,2),
  calidad            varchar(10),
  observaciones      text,
  idlote             integer REFERENCES public.lote(idlote),
  idpalma            integer REFERENCES public.palma(idpalma)
);

CREATE TABLE IF NOT EXISTS public.insumo (
  idinsumo                  serial PRIMARY KEY,
  nombre                    varchar(100),
  tipo                      varchar(100),
  stockactual               numeric(10,2),
  stockminimo               numeric(10,2),
  costounitario             numeric(10,2),
  unidadmedida              varchar(50),
  fechaultimaactualizacion  date,
  idadminregistro           integer REFERENCES public.administrador(idusuario)
);

CREATE TABLE IF NOT EXISTS public.tarea (
  idtarea           serial PRIMARY KEY,
  tipoactividad     varchar(50),
  fechaprogramada   date,
  tiempototaltarea  numeric(10,2),
  estado            varchar(50),
  esrecurrente      varchar(10),
  frecuenciadias    integer,
  costototal        numeric(10,2),
  costotransporte   numeric(10,2),
  cosecha           jsonb,
  idadmincreador    integer REFERENCES public.administrador(idusuario),
  idcultivo         integer REFERENCES public.cultivo(idcultivo)
);

CREATE TABLE IF NOT EXISTS public.detalle_tarea (
  iddetalletarea  serial PRIMARY KEY,
  cantidadusada   numeric(10,2),
  idinsumo        integer REFERENCES public.insumo(idinsumo),
  idtarea         integer REFERENCES public.tarea(idtarea) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.asignacion_tarea (
  idasigtarea         serial PRIMARY KEY,
  fechaasignacion     date,
  estado              varchar(50),
  horastrabajadas     numeric(10,2),
  jornadastrabajadas  numeric(10,2),
  pagoacordado        numeric(10,2),
  idadminasignador    integer REFERENCES public.administrador(idusuario),
  idempleado          integer REFERENCES public.empleado(idusuario),
  idtarea             integer REFERENCES public.tarea(idtarea) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.empleado_cosecha (
  idempleadocosecha  serial PRIMARY KEY,
  cantidadcosechada  numeric(10,2),
  valorunitario      numeric(10,2),
  preciobruto        numeric(10,2),
  deducciones        numeric(10,2),
  precioneto         numeric(10,2),
  fechatrabajo       date,
  observaciones      text,
  idempleado         integer REFERENCES public.empleado(idusuario)
);

CREATE TABLE IF NOT EXISTS public.notificacion (
  idnotificacion  serial PRIMARY KEY,
  mensaje         text,
  tipo            varchar(50),
  tabla_origen    varchar(50),
  idregistro      integer,
  fecha           timestamp DEFAULT now(),
  leida           boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.auditoria (
  idauditoria   serial PRIMARY KEY,
  tabla_nombre  varchar(50),
  operacion     varchar(10),
  idregistro    integer,
  descripcion   text,
  fecha         timestamp DEFAULT now()
);
