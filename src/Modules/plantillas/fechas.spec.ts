import { fechaBase, primeraFecha, fechaColombia } from './fechas';

const HOY = '2026-10-28';

describe('fechaBase', () => {
  it('«inicio» es la siembra si aún no ocurre y hoy si el cultivo ya está establecido', () => {
    expect(fechaBase('inicio', { fechasiembra: '2026-12-01' }, HOY)).toBe('2026-12-01');
    expect(fechaBase('inicio', { fechasiembra: '2019-03-15' }, HOY)).toBe(HOY);
    expect(fechaBase('inicio', {}, HOY)).toBe(HOY);
  });

  it('siembra y cosecha estimada salen del cultivo', () => {
    expect(fechaBase('siembra', { fechasiembra: '2026-03-10' }, HOY)).toBe('2026-03-10');
    expect(fechaBase('cosecha_estimada', { fechacosechaestimada: '2026-12-05' }, HOY)).toBe('2026-12-05');
    expect(fechaBase('siembra', {}, HOY)).toBeNull();
  });
});

describe('primeraFecha en cultivos establecidos', () => {
  const mantenimiento = { base: 'inicio', diasoffset: 15, esrecurrente: true, frecuenciadias: 120, diasfin: 365 };

  it('una palma sembrada en 2019 recibe sus labores de mantenimiento desde hoy, no en el pasado', () => {
    const f = primeraFecha(mantenimiento, { fechasiembra: '2019-03-15' }, HOY);

    expect(f).toEqual({ fecha: '2026-11-12', pasada: false, ajustada: false, terminada: false }); // hoy + 15 días
  });

  it('una labor repetitiva cuyo ciclo ya terminó no se vuelve a programar', () => {
    // Maíz sembrado el 10 de agosto: malezas desde los 25 días, cada 20 días, hasta los 80 (28 de octubre)
    const malezas = { base: 'siembra', diasoffset: 25, esrecurrente: true, frecuenciadias: 20, diasfin: 80 };
    const f = primeraFecha(malezas, { fechasiembra: '2026-08-10' }, HOY);

    // La siguiente repetición sería el 3 de noviembre, después del fin del ciclo
    expect(f).toEqual({ fecha: null, pasada: true, ajustada: false, terminada: true });
  });

  it('dentro del ciclo corre a la próxima repetición y lo marca como ajustada', () => {
    const riego = { base: 'siembra', diasoffset: 3, esrecurrente: true, frecuenciadias: 4, diasfin: 90 };
    const f = primeraFecha(riego, { fechasiembra: '2026-09-20' }, HOY);

    // 23 sep, 27 sep, 1 oct, 5 oct, 9, 13, 17, 21, 25, 29 oct → la primera ≥ 28 oct es el 29
    expect(f).toEqual({ fecha: '2026-10-29', pasada: false, ajustada: true, terminada: false });
  });

  it('una labor que no se repite y ya pasó queda como pasada (se muestra pero no se marca)', () => {
    const fert = { base: 'siembra', diasoffset: 20, esrecurrente: false, frecuenciadias: null, diasfin: null };

    expect(primeraFecha(fert, { fechasiembra: '2026-01-01' }, HOY)).toEqual({
      fecha: '2026-01-21', pasada: true, ajustada: false, terminada: false,
    });
  });

  it('sin la fecha base del cultivo no se puede programar', () => {
    const cosecha = { base: 'cosecha_estimada', diasoffset: 0, esrecurrente: false, frecuenciadias: null, diasfin: null };

    expect(primeraFecha(cosecha, { fechasiembra: '2026-03-01' }, HOY).fecha).toBeNull();
  });

  it('una fecha futura se deja tal cual', () => {
    const siembra = { base: 'siembra', diasoffset: 0, esrecurrente: false, frecuenciadias: null, diasfin: null };

    expect(primeraFecha(siembra, { fechasiembra: '2026-11-20' }, HOY).fecha).toBe('2026-11-20');
  });
});

describe('fechaColombia', () => {
  it('un instante a las 8 p. m. en Colombia sigue siendo del mismo día aunque en UTC ya sea el siguiente', () => {
    expect(fechaColombia(new Date('2026-10-29T01:00:00Z'))).toBe('2026-10-28');
    expect(fechaColombia(new Date('2026-10-28T15:00:00Z'))).toBe('2026-10-28');
  });
});
