-- Guarda la URL de la foto del lote; la imagen se almacena en Cloudinary.
ALTER TABLE public.lote
  ADD COLUMN IF NOT EXISTS imagenurl text;
