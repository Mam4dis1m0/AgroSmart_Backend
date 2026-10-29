import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TareasService } from './tareas.service';
import { Tarea } from '../../Entidades/entities/Tarea';
import { Empleado } from '../../Entidades/entities/Empleado';
import { AsignacionTarea } from '../../Entidades/entities/AsignacionTarea';
import { Insumo } from '../../Entidades/entities/Insumo';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { MailService } from '../../mail/mail.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  mockMailService,
  createMockRepository,
  conSesion,
  sesionAdmin,
} from '../../test/mocks/common-providers.mock';

describe('TareasService', () => {
  let service: TareasService;
  const mockTareaRepository = createMockRepository();
  const mockEmpleadoRepository = createMockRepository();
  const mockAsignacionTareaRepository = createMockRepository();
  const mockInsumoRepository = createMockRepository();
  const mockDetalleTareaRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TareasService,
        { provide: getRepositoryToken(Tarea), useValue: mockTareaRepository },
        {
          provide: getRepositoryToken(Empleado),
          useValue: mockEmpleadoRepository,
        },
        {
          provide: getRepositoryToken(AsignacionTarea),
          useValue: mockAsignacionTareaRepository,
        },
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepository },
        {
          provide: getRepositoryToken(DetalleTarea),
          useValue: mockDetalleTareaRepository,
        },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<TareasService>(TareasService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODO REPRESENTATIVO #3: completar()
  // Se eligió porque coordina varias operaciones dependientes entre sí:
  // actualiza la asignación, sincroniza el estado de la tarea principal,
  // notifica por correo al administrador e invalida el caché — un flujo
  // típico de "efecto en cascada" que es fácil de romper sin darse cuenta.
  // ─────────────────────────────────────────────────────────────────────────
  describe('completar()', () => {
    const asignacionBase = {
      idasigtarea: 10,
      estado: 'En progreso',
      idtarea: { idtarea: 7, tipoactividad: 'Fumigación' },
      idempleado: { idusuario2: { primernombre: 'Juan' } },
      idadminasignador: { idusuario2: { email: 'admin@agrosmart.com' } },
    };

    it('debe marcar la asignación como Completado y guardarla', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asignacionBase,
      });
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      const result = await conSesion(sesionAdmin, () => service.completar(10));

      expect(result.estado).toBe('Completado');
      expect(mockAsignacionTareaRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'Completado' }),
      );
    });

    it('debe actualizar también el estado de la tarea principal asociada', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asignacionBase,
      });
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      await conSesion(sesionAdmin, () => service.completar(10));

      // Se actualiza SOLO la tarea de la finca activa (idfinca = 1)
      expect(mockTareaRepository.update).toHaveBeenCalledWith(
        { idtarea: 7, idfinca: 1 },
        { estado: 'Completado' },
      );
    });

    it('debe notificar por correo al administrador que asignó la tarea', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asignacionBase,
      });
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      await conSesion(sesionAdmin, () => service.completar(10));

      expect(mockMailService.notificarTareaCompletada).toHaveBeenCalledWith(
        'admin@agrosmart.com',
        'Fumigación',
        'Juan',
      );
    });

    it('NO debe intentar notificar si la asignación no tiene admin asignador con email', async () => {
      const sinAdmin = { ...asignacionBase, idadminasignador: null };
      mockAsignacionTareaRepository.findOne.mockResolvedValue(sinAdmin);
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      await conSesion(sesionAdmin, () => service.completar(10));

      expect(mockMailService.notificarTareaCompletada).not.toHaveBeenCalled();
    });

    it('debe invalidar el caché de la tarea y el listado general tras completar', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asignacionBase,
      });
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      await conSesion(sesionAdmin, () => service.completar(10));

      // Las claves de caché llevan la finca: el caché de una finca nunca se sirve a otra
      expect(mockCacheService.delete).toHaveBeenCalledWith('tareas_f1_7');
      expect(mockCacheService.delete).toHaveBeenCalledWith('tareas_f1_all');
    });

    it('NO completa la tarea mientras otra asignación siga abierta (cuadrilla)', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asignacionBase,
      });
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );
      mockAsignacionTareaRepository.count.mockResolvedValue(1);

      await conSesion(sesionAdmin, () => service.completar(10));

      expect(mockTareaRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ estado: 'Completado' }),
      );
      mockAsignacionTareaRepository.count.mockReset();
    });

    it('calcula las horas trabajadas a partir del cronómetro si no se digitaron', async () => {
      const inicio = new Date(Date.now() - 2.5 * 3_600_000);
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asignacionBase,
        fechainicio: inicio,
      });
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      const result = await conSesion(sesionAdmin, () => service.completar(10));

      expect(result.horastrabajadas).toBeCloseTo(2.5, 1);
      expect(result.fechafin).toBeInstanceOf(Date);
    });

    it('respeta las horas ya digitadas a mano', async () => {
      const inicio = new Date(Date.now() - 5 * 3_600_000);
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asignacionBase,
        fechainicio: inicio,
        horastrabajadas: 3,
      });
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      const result = await conSesion(sesionAdmin, () => service.completar(10));

      expect(result.horastrabajadas).toBe(3);
    });
  });

  describe('completar() de una tarea de cosecha', () => {
    const asig = () => ({
      idasigtarea: 10,
      estado: 'En progreso',
      idtarea: { idtarea: 7, tipoactividad: 'Cosecha' },
      idempleado: { idusuario: 5, idusuario2: { primernombre: 'Ana' } },
      idadminasignador: {
        idusuario: 1,
        idusuario2: { email: 'admin@agrosmart.com' },
      },
    });
    const query = jest.fn();

    beforeEach(() => {
      (mockTareaRepository as any).manager = { query };
      // La tarea tiene cultivo (el cultivo 3); el resto de consultas no devuelve filas
      query.mockReset().mockImplementation(async (sql: string) => (String(sql).includes('SELECT idcultivo') ? [{ idcultivo: 3 }] : []));
      mockAsignacionTareaRepository.save.mockImplementation((a) => Promise.resolve(a));
    });

    it('registra lo recolectado en Cosechas, ligado a la tarea y a quien lo recogió', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue(asig());

      await conSesion(sesionAdmin, () =>
        service.completar(10, '2026-10-28T15:00:00Z', {
          cantidad: 120.5,
          unidad: 'kg',
          calidad: 'Primera',
        }),
      );

      const insercion = query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO cosecha'),
      );
      expect(insercion).toBeDefined();
      expect(insercion![1]).toEqual([
        7,
        1,
        '2026-10-28',
        120.5,
        'kg',
        'Primera',
        'Tarea #7: Cosecha',
        1,
        5,
      ]);
    });

    it('si la tarea no tiene cultivo avisa en vez de perder en silencio lo recolectado, y no completa', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue(asig());
      query.mockImplementation(async (sql: string) => (String(sql).includes('SELECT idcultivo') ? [{ idcultivo: null }] : []));

      await expect(conSesion(sesionAdmin, () => service.completar(10, null, { cantidad: 50 }))).rejects.toThrow('no tiene cultivo');
      expect(mockAsignacionTareaRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza una cantidad inválida sin completar la asignación', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue(asig());

      await expect(
        conSesion(sesionAdmin, () =>
          service.completar(10, null, { cantidad: -3 }),
        ),
      ).rejects.toThrow('mayor que cero');
      await expect(
        conSesion(sesionAdmin, () =>
          service.completar(10, null, { cantidad: NaN }),
        ),
      ).rejects.toThrow('mayor que cero');
      expect(mockAsignacionTareaRepository.save).not.toHaveBeenCalled();
    });

    it('sin cantidad (una tarea común) no toca Cosechas', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue(asig());

      await conSesion(sesionAdmin, () => service.completar(10));

      expect(
        query.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO cosecha'),
        ),
      ).toBe(false);
    });

    it('usa kg cuando no se indica unidad', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue(asig());

      await conSesion(sesionAdmin, () =>
        service.completar(10, null, { cantidad: 30 }),
      );

      const insercion = query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO cosecha'),
      );
      expect(insercion![1][4]).toBe('kg');
    });
  });

  describe('create() de una tarea de cosecha', () => {
    it('exige cultivo: sin él no habría a qué cosecha pertenece lo recolectado', async () => {
      await expect(conSesion(sesionAdmin, () => service.create({ tipoactividad: 'Cosecha de maíz' } as any))).rejects.toThrow('necesita un cultivo');
      await expect(conSesion(sesionAdmin, () => service.create({ tipoactividad: 'cosecha' } as any))).rejects.toThrow('necesita un cultivo');
    });

    it('una tarea que no es de cosecha no necesita cultivo', async () => {
      mockSyncService.isOnline.mockResolvedValue(false);
      const r: any = await conSesion(sesionAdmin, () => service.create({ tipoactividad: 'Riego' } as any));
      expect(r._offline).toBe(true);
    });
  });

  describe('update() hacia una tarea de cosecha', () => {
    it('no permite cambiar a «Cosecha» una tarea que no tiene cultivo', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      mockTareaRepository.findOneBy.mockResolvedValue({ idtarea: 5, estado: 'Pendiente' });
      (mockTareaRepository as any).manager = { query: jest.fn().mockResolvedValue([{ idcultivo: null }]) };

      await expect(conSesion(sesionAdmin, () => service.update(5, { tipoactividad: 'Cosecha' } as any))).rejects.toThrow('necesita un cultivo');
    });

    it('si la tarea ya tiene cultivo, sí puede ser de cosecha', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      mockTareaRepository.findOneBy.mockResolvedValue({ idtarea: 5, estado: 'Pendiente' });
      mockTareaRepository.save.mockImplementation((t) => Promise.resolve(t));
      (mockTareaRepository as any).manager = { query: jest.fn().mockResolvedValue([{ idcultivo: 3 }]) };

      const r: any = await conSesion(sesionAdmin, () => service.update(5, { tipoactividad: 'Cosecha' } as any));

      expect(r.tipoactividad).toBe('Cosecha');
    });
  });

  describe('iniciar()', () => {
    const asig = () => ({
      idasigtarea: 10,
      estado: 'Asignado',
      fechainicio: null,
      idtarea: { idtarea: 7, fechainicio: null },
      idempleado: { idusuario: 1 },
    });

    it('guarda la hora de inicio y pasa asignación y tarea a "En progreso"', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue(asig());
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      const result = await conSesion(sesionAdmin, () => service.iniciar(10));

      expect(result.estado).toBe('En progreso');
      expect(result.fechainicio).toBeInstanceOf(Date);
      expect(mockTareaRepository.update).toHaveBeenCalledWith(
        { idtarea: 7, idfinca: 1 },
        { estado: 'En progreso' },
      );
    });

    it('usa la hora enviada por el celular (trabajo sin red) y no la del servidor', async () => {
      const real = new Date(Date.now() - 3_600_000).toISOString();
      mockAsignacionTareaRepository.findOne.mockResolvedValue(asig());
      mockAsignacionTareaRepository.save.mockImplementation((a) =>
        Promise.resolve(a),
      );

      const result = await conSesion(sesionAdmin, () =>
        service.iniciar(10, real),
      );

      expect(result.fechainicio?.toISOString()).toBe(real);
    });

    it('rechaza iniciar una asignación ya completada', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({
        ...asig(),
        estado: 'Completado',
      });

      await expect(
        conSesion(sesionAdmin, () => service.iniciar(10)),
      ).rejects.toThrow('ya está completada');
    });
  });
});
