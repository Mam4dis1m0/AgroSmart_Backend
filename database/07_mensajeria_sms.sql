-- AgroChat por SMS: el hilo del Marketplace no se pierde cuando no hay internet.
-- Ejecutar una vez en el SQL Editor de Supabase (es seguro repetirlo).
--
--   canal         → por dónde llegó el mensaje: 'APP' (internet) o 'SMS'
--   idcliente     → id generado por la app (UUID) para que reintentos / sincronizaciones
--                   no dupliquen mensajes
--   sms_sid       → MessageSid de Twilio para SMS entrantes (Twilio reintenta el webhook)
--   sms_relay_at  → cuándo se reenvió por SMS al destinatario que estaba sin conexión

ALTER TABLE mensaje_mercado
  ADD COLUMN IF NOT EXISTS canal        VARCHAR(5)  NOT NULL DEFAULT 'APP',
  ADD COLUMN IF NOT EXISTS idcliente    VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS sms_sid      VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS sms_relay_at TIMESTAMPTZ NULL;

ALTER TABLE mensaje_mercado DROP CONSTRAINT IF EXISTS mensaje_mercado_canal_check;
ALTER TABLE mensaje_mercado ADD CONSTRAINT mensaje_mercado_canal_check
  CHECK (canal IN ('APP', 'SMS'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_mensaje_idcliente
  ON mensaje_mercado (idremitente, idcliente) WHERE idcliente IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mensaje_sms_sid
  ON mensaje_mercado (sms_sid) WHERE sms_sid IS NOT NULL;

-- Para encontrar al usuario por el número que envía el SMS (últimos 10 dígitos)
CREATE INDEX IF NOT EXISTS ix_usuario_telefono_digitos
  ON usuario ((right(regexp_replace(telefono, '\D', '', 'g'), 10)));
