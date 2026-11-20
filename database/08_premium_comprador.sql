-- Premium para compradores del Marketplace (suscripción por usuario, no por finca).
-- Solo AGREGA columnas y un plan. Idempotente: se puede ejecutar más de una vez.

-- Los planes existentes son de fincas; el nuevo es para compradores.
ALTER TABLE public.plan
  ADD COLUMN IF NOT EXISTS audiencia varchar(20) NOT NULL DEFAULT 'finca';

-- Hasta cuándo el comprador tiene Premium (NULL = plan gratis).
ALTER TABLE public.comprador_perfil
  ADD COLUMN IF NOT EXISTS premiumhasta timestamptz;

-- AJUSTAR: precio de ejemplo.
INSERT INTO public.plan (codigo, nombre, descripcion, preciomensual, maxcultivos, maxempleados, maxfincas,
                         comisionmarketplace, funciones, audiencia)
VALUES
 ('COMPRADOR_GRATIS', 'Comprador',
  'Compra en el Marketplace, chatea con productores y recibe alertas de ofertas cercanas.',
  0, NULL, NULL, NULL, 0,
  '{"early_access":false,"alerta_inmediata":false,"comprador_verificado":false}'::jsonb, 'comprador'),
 ('COMPRADOR_PREMIUM', 'Comprador Premium',
  'Ve las ofertas nuevas antes que nadie, recibe la alerta apenas se publican y aparece como Comprador Premium ante los productores.',
  14900, NULL, NULL, NULL, 0,
  '{"early_access":true,"alerta_inmediata":true,"comprador_verificado":true}'::jsonb, 'comprador')
ON CONFLICT (codigo) DO NOTHING;
