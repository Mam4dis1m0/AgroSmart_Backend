import { AsignacionSugeridaService } from './asignacion-sugerida.service';

const cand = (o: Partial<Parameters<typeof AsignacionSugeridaService.puntuar>[0]> = {}) => ({
  idusuario: 1, primernombre: 'Ana', primerapellido: 'Gómez', fotoperfil: null,
  horassemana: 0, horasdia: 0, afinidadactividad: 0, afinidadcultivo: 0, continuidad: false, ...o,
});

describe('AsignacionSugeridaService.puntuar', () => {
  const p = AsignacionSugeridaService.puntuar;

  it('quien no tiene carga puntúa más que quien ya está saturado', () => {
    expect(p(cand()).puntaje).toBeGreaterThan(p(cand({ horassemana: 20 })).puntaje);
  });

  it('quien ya trabajó ocho horas ese día se penaliza con fuerza y se explica', () => {
    const libre = p(cand());
    const ocupado = p(cand({ horasdia: 8 }));
    expect(libre.puntaje - ocupado.puntaje).toBeGreaterThanOrEqual(40);
    expect(ocupado.motivos).toContain('Ocupado ese día');
  });

  it('la experiencia en la labor y el cultivo suma, con tope', () => {
    const base = p(cand()).puntaje;
    expect(p(cand({ afinidadactividad: 2 })).puntaje).toBe(base + 12);
    expect(p(cand({ afinidadactividad: 50 })).puntaje).toBe(base + 30);
    expect(p(cand({ afinidadcultivo: 1 })).motivos).toContain('Conoce este cultivo');
  });

  it('quien hizo la vez anterior tiene ventaja de continuidad', () => {
    const r = p(cand({ continuidad: true }));
    expect(r.puntaje).toBe(p(cand()).puntaje + 20);
    expect(r.motivos).toContain('Hizo la vez anterior');
  });

  it('las penalizaciones tienen tope (nadie queda con puntaje negativo) y arma el nombre completo', () => {
    const r = p(cand({ horassemana: 500, horasdia: 40 }));
    expect(r.puntaje).toBe(15); // 100 − 45 por carga semanal − 40 por día completo
    expect(r.puntaje).toBeGreaterThanOrEqual(0);
    expect(r.nombre).toBe('Ana Gómez');
  });

  it('sin nombre en el perfil usa un texto de respaldo', () => {
    expect(p(cand({ primernombre: null, primerapellido: null, idusuario: 7 })).nombre).toBe('Empleado #7');
  });
});
