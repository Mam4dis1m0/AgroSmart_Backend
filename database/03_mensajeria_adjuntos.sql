-- AgroChat: fotos y audios en los mensajes del Marketplace.
-- Ejecutar una vez en el SQL Editor de Supabase (es seguro repetirlo).

ALTER TABLE mensaje_mercado
  ADD COLUMN IF NOT EXISTS tipo         VARCHAR(10) NOT NULL DEFAULT 'TEXTO',
  ADD COLUMN IF NOT EXISTS adjunto_url  TEXT        NULL,
  ADD COLUMN IF NOT EXISTS duracion_seg INTEGER     NULL;

-- Un mensaje con foto o audio puede no llevar texto.
ALTER TABLE mensaje_mercado ALTER COLUMN contenido DROP NOT NULL;

ALTER TABLE mensaje_mercado DROP CONSTRAINT IF EXISTS mensaje_mercado_contenido_check;
ALTER TABLE mensaje_mercado ADD CONSTRAINT mensaje_mercado_contenido_check
  CHECK (contenido IS NULL OR char_length(contenido) BETWEEN 1 AND 2000);

ALTER TABLE mensaje_mercado DROP CONSTRAINT IF EXISTS mensaje_mercado_tipo_check;
ALTER TABLE mensaje_mercado ADD CONSTRAINT mensaje_mercado_tipo_check
  CHECK (tipo IN ('TEXTO', 'IMAGEN', 'AUDIO'));

-- Texto siempre lleva contenido; foto/audio siempre llevan archivo.
ALTER TABLE mensaje_mercado DROP CONSTRAINT IF EXISTS mensaje_mercado_adjunto_check;
ALTER TABLE mensaje_mercado ADD CONSTRAINT mensaje_mercado_adjunto_check
  CHECK ((tipo = 'TEXTO' AND contenido IS NOT NULL)
      OR (tipo <> 'TEXTO' AND adjunto_url IS NOT NULL));
