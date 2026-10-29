-- Plantillas de labores: personas sugeridas POR HECTÁREA y horas esperadas para TERMINAR la tarea.
-- Solo AGREGA columnas (y copia un dato existente a la columna nueva). No elimina ni cambia nada.
-- Idempotente: se puede ejecutar más de una vez.
--
-- Cómo se leen ahora los dos números de una labor:
--   · personasporhectarea: cuántas personas se sugieren por cada hectárea del lote
--     (2 por hectárea en un lote de 3 ha = 6 personas).
--   · horasestimadas: horas que se espera tarde ese grupo en terminar la tarea. No cambia con el tamaño
--     del lote: si el lote es más grande, se sugieren más personas, no más horas.
-- El costo estimado de mano de obra es personas × horas × costo por hora de la finca.

ALTER TABLE public.plantilla_labor
  ADD COLUMN IF NOT EXISTS personasporhectarea numeric(6,2) NOT NULL DEFAULT 1;

-- Lo que antes era «personas necesarias» pasa a ser «personas por hectárea» (se conservan las mismas cifras)
UPDATE public.plantilla_labor
   SET personasporhectarea = numpersonas
 WHERE personasporhectarea = 1 AND COALESCE(numpersonas, 1) <> 1;

-- La tarea guarda cuántas personas necesita en su lote (personas por hectárea × hectáreas, redondeado hacia arriba)
ALTER TABLE public.tarea
  ADD COLUMN IF NOT EXISTS personasnecesarias integer;
