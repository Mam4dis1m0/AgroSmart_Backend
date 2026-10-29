/**
 * Categorías de manejo: agrupan los tipos de cultivo que se trabajan de forma parecida
 * (mismas labores, mismos ciclos). Cada categoría tiene su catálogo base de labores.
 */
export const CATEGORIAS: { id: string; nombre: string; ejemplos: string }[] = [
  { id: 'ciclo_corto', nombre: 'Ciclo corto', ejemplos: 'Maíz, arroz, fríjol' },
  {
    id: 'hortaliza',
    nombre: 'Hortalizas',
    ejemplos: 'Tomate, cebolla, lechuga',
  },
  {
    id: 'perenne_arboreo',
    nombre: 'Perennes arbóreos',
    ejemplos: 'Café, cacao, aguacate, mango, cítricos',
  },
  { id: 'palma', nombre: 'Palma de aceite', ejemplos: 'Palma de aceite' },
  { id: 'cana', nombre: 'Caña', ejemplos: 'Caña de azúcar' },
  {
    id: 'semipermanente',
    nombre: 'Semipermanentes',
    ejemplos: 'Plátano, yuca',
  },
  { id: 'pastos', nombre: 'Pastos', ejemplos: 'Pastos y forrajes' },
];

const TIPO_A_CATEGORIA: Record<string, string> = {
  maiz: 'ciclo_corto',
  arroz: 'ciclo_corto',
  frijol: 'ciclo_corto',
  hortalizas: 'hortaliza',
  cafe: 'perenne_arboreo',
  cacao: 'perenne_arboreo',
  aguacate: 'perenne_arboreo',
  mango: 'perenne_arboreo',
  citricos: 'perenne_arboreo',
  'palma de aceite': 'palma',
  'cana de azucar': 'cana',
  platano: 'semipermanente',
  yuca: 'semipermanente',
  pastos: 'pastos',
  // Sinónimos y variantes que la gente escribe a mano
  palma: 'palma',
  cana: 'cana',
  pasto: 'pastos',
  forraje: 'pastos',
  limon: 'perenne_arboreo',
  naranja: 'perenne_arboreo',
  mandarina: 'perenne_arboreo',
  banano: 'semipermanente',
  tomate: 'hortaliza',
  cebolla: 'hortaliza',
  lechuga: 'hortaliza',
  zanahoria: 'hortaliza',
  pimenton: 'hortaliza',
  habichuela: 'hortaliza',
};

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const CLAVES_POR_LARGO = Object.keys(TIPO_A_CATEGORIA).sort(
  (a, b) => b.length - a.length,
);

/**
 * Categoría que corresponde a un tipo de cultivo. Acepta el nombre exacto o que lo contenga
 * ("Maíz amarillo", "Palma"); null si es un tipo desconocido (el admin elige la categoría).
 */
export function categoriaDeTipo(tipo?: string | null): string | null {
  if (!tipo) return null;
  const t = sinTildes(tipo);
  if (TIPO_A_CATEGORIA[t]) return TIPO_A_CATEGORIA[t];
  const clave = CLAVES_POR_LARGO.find((k) =>
    new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(t),
  );
  return clave ? TIPO_A_CATEGORIA[clave] : null;
}

export const esCategoria = (c?: string | null): boolean =>
  !!c && CATEGORIAS.some((x) => x.id === c);
