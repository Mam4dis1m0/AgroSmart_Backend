-- Permite registrar pagos del Premium de compradores (tipo SUSCRIPCION_COMPRADOR).
-- Sin esto el INSERT falla con "violates check constraint pago_tipo_check".
-- Idempotente: se puede ejecutar más de una vez.

ALTER TABLE public.pago DROP CONSTRAINT IF EXISTS pago_tipo_check;
ALTER TABLE public.pago
  ADD CONSTRAINT pago_tipo_check
  CHECK (tipo IN ('SUSCRIPCION', 'SUSCRIPCION_COMPRADOR', 'LISTADO_DESTACADO', 'COMISION_MARKETPLACE'));
