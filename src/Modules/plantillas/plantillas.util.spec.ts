import { categoriaDeTipo, esCategoria } from './categorias';
import { fechaBase, sumarDias } from './fechas';

describe('categorías de cultivo', () => {
  it('deduce la categoría de los tipos conocidos ignorando tildes y mayúsculas', () => {
    expect(categoriaDeTipo('Maíz')).toBe('ciclo_corto');
    expect(categoriaDeTipo('café')).toBe('perenne_arboreo');
    expect(categoriaDeTipo('CAÑA DE AZÚCAR')).toBe('cana');
    expect(categoriaDeTipo('Palma de aceite')).toBe('palma');
    expect(categoriaDeTipo('Fríjol')).toBe('ciclo_corto');
  });

  it('reconoce variantes que contienen un tipo conocido', () => {
    expect(categoriaDeTipo('Palma')).toBe('palma');
    expect(categoriaDeTipo('Maíz QA')).toBe('ciclo_corto');
    expect(categoriaDeTipo('Café especial')).toBe('perenne_arboreo');
    expect(categoriaDeTipo('Limón tahití')).toBe('perenne_arboreo');
  });

  it('devuelve null para tipos escritos a mano o vacíos', () => {
    expect(categoriaDeTipo('Quinua')).toBeNull();
    expect(categoriaDeTipo('')).toBeNull();
    expect(categoriaDeTipo(null)).toBeNull();
  });

  it('valida categorías existentes', () => {
    expect(esCategoria('pastos')).toBe(true);
    expect(esCategoria('otra')).toBe(false);
  });
});

describe('fechas del plan', () => {
  it('suma y resta días cruzando meses y años bisiestos', () => {
    expect(sumarDias('2026-10-27', 5)).toBe('2026-11-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('la fecha base depende de la plantilla y del cultivo', () => {
    const c = {
      fechasiembra: '2026-03-10',
      fechacosechaestimada: '2026-09-10',
    };
    expect(fechaBase('siembra', c)).toBe('2026-03-10');
    expect(fechaBase('cosecha_estimada', c)).toBe('2026-09-10');
    expect(fechaBase('siembra', { fechasiembra: null })).toBeNull();
    expect(
      fechaBase('cosecha_estimada', { fechasiembra: '2026-03-10' }),
    ).toBeNull();
    expect(fechaBase('inicio', { fechasiembra: null })).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
