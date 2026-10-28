import { ForbiddenException, NotFoundException } from '@nestjs/common';

const subir = jest.fn();
jest.mock('cloudinary', () => ({ v2: { config: jest.fn(), uploader: { upload: (...a: any[]) => subir(...a) } } }));

import { TareaEvidenciaService } from './tarea-evidencia.service';

const admin: any = { idusuario: 1, rol: 'admin', idfinca: 1, email: '' };
const empleado: any = { idusuario: 5, rol: 'empleado', idfinca: 1, email: '' };

function dsCon(respuestas: Record<string, any[]>) {
  const query = jest.fn(async (sql: string) => {
    for (const [fragmento, r] of Object.entries(respuestas)) if (sql.includes(fragmento)) return r;
    return [];
  });
  return { ds: { query } as any, query };
}

describe('TareaEvidenciaService', () => {
  beforeEach(() => subir.mockReset());

  it('sube la foto a la carpeta de la finca y la guarda ligada a la tarea', async () => {
    subir.mockResolvedValue({ secure_url: 'https://cdn/foto.jpg' });
    const { ds, query } = dsCon({
      'SELECT 1 FROM tarea': [{ '?column?': 1 }],
      'INSERT INTO tarea_evidencia': [{ idevidencia: 9 }],
      'FROM tarea_evidencia e': [{ idevidencia: 9, idasigtarea: 4, url: 'https://cdn/foto.jpg', observaciones: 'Listo', fecha: 'hoy', autor: 'Ana' }],
    });

    const r = await new TareaEvidenciaService(ds).registrar(1, 3, admin, '/tmp/f.jpg', { observaciones: ' Listo ', idasigtarea: 4 });

    expect(subir).toHaveBeenCalledWith('/tmp/f.jpg', expect.objectContaining({ folder: 'agrosmart/evidencias/finca_1' }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tarea_evidencia'), [1, 3, 4, 1, 'https://cdn/foto.jpg', 'Listo']);
    expect(r).toMatchObject({ idevidencia: 9, url: 'https://cdn/foto.jpg' });
  });

  it('un empleado no puede agregar ni ver fotos de una tarea que no le asignaron', async () => {
    const { ds } = dsCon({ 'SELECT 1 FROM tarea': [{ '?column?': 1 }], 'FROM asignacion_tarea': [] });
    const svc = new TareaEvidenciaService(ds);

    await expect(svc.registrar(1, 3, empleado, '/tmp/f.jpg')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listar(1, 3, empleado)).rejects.toBeInstanceOf(ForbiddenException);
    expect(subir).not.toHaveBeenCalled();
  });

  it('no encuentra tareas de otra finca', async () => {
    const { ds } = dsCon({});

    await expect(new TareaEvidenciaService(ds).listar(1, 99, admin)).rejects.toBeInstanceOf(NotFoundException);
  });
});
