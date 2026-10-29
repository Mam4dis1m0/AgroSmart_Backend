import { ForbiddenException, NotFoundException } from '@nestjs/common';

const subir = jest.fn();
const borrar = jest.fn();
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: (...a: any[]) => subir(...a),
      destroy: (...a: any[]) => borrar(...a),
    },
  },
}));

import { TareaEvidenciaService } from './tarea-evidencia.service';

const admin: any = { idusuario: 1, rol: 'admin', idfinca: 1, email: '' };
const empleado: any = { idusuario: 5, rol: 'empleado', idfinca: 1, email: '' };

function dsCon(respuestas: Record<string, any[]>) {
  const query = jest.fn(async (sql: string) => {
    for (const [fragmento, r] of Object.entries(respuestas))
      if (sql.includes(fragmento)) return r;
    return [];
  });
  return { ds: { query } as any, query };
}

describe('TareaEvidenciaService', () => {
  beforeEach(() => {
    subir.mockReset();
    borrar.mockReset();
  });

  it('el trabajador asignado sube la foto ligada a la tarea', async () => {
    subir.mockResolvedValue({ secure_url: 'https://cdn/foto.jpg' });
    const { ds, query } = dsCon({
      'SELECT 1 FROM tarea': [{ '?column?': 1 }],
      'FROM asignacion_tarea': [{ '?column?': 1 }],
      'INSERT INTO tarea_evidencia': [{ idevidencia: 9 }],
      'FROM tarea_evidencia e': [
        {
          idevidencia: 9,
          idasigtarea: 4,
          url: 'https://cdn/foto.jpg',
          observaciones: 'Listo',
          fecha: 'hoy',
          autor: 'Ana',
        },
      ],
    });

    const r = await new TareaEvidenciaService(ds).registrar(
      1,
      3,
      empleado,
      '/tmp/f.jpg',
      { observaciones: ' Listo ', idasigtarea: 4 },
    );

    expect(subir).toHaveBeenCalledWith(
      '/tmp/f.jpg',
      expect.objectContaining({ folder: 'agrosmart/evidencias/finca_1' }),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tarea_evidencia'),
      [1, 3, 4, 5, 'https://cdn/foto.jpg', 'Listo'],
    );
    expect(r).toMatchObject({ idevidencia: 9, url: 'https://cdn/foto.jpg' });
  });

  it('el administrador no puede enviar evidencias en nombre del trabajador', async () => {
    const { ds } = dsCon({});
    await expect(
      new TareaEvidenciaService(ds).registrar(1, 3, admin, '/tmp/f.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(subir).not.toHaveBeenCalled();
  });

  it('un empleado no puede agregar ni ver fotos de una tarea que no le asignaron', async () => {
    const { ds } = dsCon({
      'SELECT 1 FROM tarea': [{ '?column?': 1 }],
      'FROM asignacion_tarea': [],
    });
    const svc = new TareaEvidenciaService(ds);

    await expect(
      svc.registrar(1, 3, empleado, '/tmp/f.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listar(1, 3, empleado)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(subir).not.toHaveBeenCalled();
  });

  it('no encuentra tareas de otra finca', async () => {
    const { ds } = dsCon({});

    await expect(
      new TareaEvidenciaService(ds).listar(1, 99, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el admin borra la foto de Cloudinary y el registro', async () => {
    borrar.mockResolvedValue({ result: 'ok' });
    const { ds, query } = dsCon({
      'SELECT 1 FROM tarea': [{ '?column?': 1 }],
      'SELECT idevidencia, idusuario, url': [
        {
          idevidencia: 9,
          idusuario: 5,
          url: 'https://res.cloudinary.com/demo/image/upload/v123/agrosmart/evidencias/finca_1/abc.jpg',
        },
      ],
      'DELETE FROM tarea_evidencia': [],
    });

    const r = await new TareaEvidenciaService(ds).eliminar(1, 3, 9, admin);

    expect(borrar).toHaveBeenCalledWith('agrosmart/evidencias/finca_1/abc');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tarea_evidencia'),
      [9],
    );
    expect(r).toEqual({ ok: true });
  });

  it('un empleado no puede borrar la foto de otro', async () => {
    borrar.mockResolvedValue({ result: 'ok' });
    const { ds } = dsCon({
      'SELECT 1 FROM tarea': [{ '?column?': 1 }],
      'FROM asignacion_tarea': [{ '?column?': 1 }],
      'SELECT idevidencia, idusuario, url': [
        { idevidencia: 9, idusuario: 1, url: 'https://cdn/otro.jpg' },
      ],
    });

    await expect(
      new TareaEvidenciaService(ds).eliminar(1, 3, 9, empleado),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(borrar).not.toHaveBeenCalled();
  });

  it('si falla el borrado en Cloudinary, igual se quita el registro', async () => {
    borrar.mockRejectedValue(new Error('cloudinary caído'));
    const { ds, query } = dsCon({
      'SELECT 1 FROM tarea': [{ '?column?': 1 }],
      'SELECT idevidencia, idusuario, url': [
        { idevidencia: 9, idusuario: 5, url: 'https://cdn/foto.jpg' },
      ],
      'DELETE FROM tarea_evidencia': [],
    });

    const r = await new TareaEvidenciaService(ds).eliminar(1, 3, 9, admin);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tarea_evidencia'),
      [9],
    );
    expect(r).toEqual({ ok: true });
  });
});
