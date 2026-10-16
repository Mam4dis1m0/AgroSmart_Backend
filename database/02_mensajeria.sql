-- Mensajería del Marketplace (comprador ↔ vendedor).
-- El módulo src/Modules/mensajeria usa estas tablas, pero ninguna migración anterior las creaba.
-- Idempotente: se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS hilo_mercado (
  idhilo            SERIAL PRIMARY KEY,
  idlistado         INTEGER NOT NULL REFERENCES listado (idlistado) ON DELETE CASCADE,
  idcomprador       INTEGER NOT NULL REFERENCES usuario (idusuario),
  idvendedor        INTEGER NOT NULL REFERENCES usuario (idusuario),
  idorden           INTEGER NULL REFERENCES orden_compra (idorden) ON DELETE SET NULL,
  ultimo_mensaje_at TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hilo_listado_comprador UNIQUE (idlistado, idcomprador)
);

CREATE INDEX IF NOT EXISTS ix_hilo_comprador ON hilo_mercado (idcomprador, ultimo_mensaje_at DESC);
CREATE INDEX IF NOT EXISTS ix_hilo_vendedor  ON hilo_mercado (idvendedor,  ultimo_mensaje_at DESC);

CREATE TABLE IF NOT EXISTS mensaje_mercado (
  idmensaje   BIGSERIAL PRIMARY KEY,
  idhilo      INTEGER NOT NULL REFERENCES hilo_mercado (idhilo) ON DELETE CASCADE,
  idremitente INTEGER NOT NULL REFERENCES usuario (idusuario),
  contenido   TEXT NOT NULL CHECK (char_length(contenido) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  leido_at    TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_mensaje_hilo ON mensaje_mercado (idhilo, idmensaje);
CREATE INDEX IF NOT EXISTS ix_mensaje_no_leidos ON mensaje_mercado (idhilo, idremitente) WHERE leido_at IS NULL;
