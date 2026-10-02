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
  mockSyncService, mockMailService,
  createMockRepository,
  conSesion, sesionAdmin,
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
        { provide: getRepositoryToken(Empleado), useValue: mockEmpleadoRepository },
        { provide: getRepositoryToken(AsignacionTarea), useValue: mockAsignacionTareaRepository },
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepository },
        { provide: getRepositoryToken(DetalleTarea), useValue: mockDetalleTareaRepository },
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
      mockAsignacionTareaRepository.findOne.mockResolvedValue({ ...asignacionBase });
      mockAsignacionTareaRepository.save.mockImplementation((a) => Promise.resolve(a));

      const result = await conSesion(sesionAdmin, () => service.completar(10));

      expect(result.estado).toBe('Completado');
      expect(mockAsignacionTareaRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'Completado' }),
      );
    });

    it('debe actualizar también el estado de la tarea principal asociada', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({ ...asignacionBase });
      mockAsignacionTareaRepository.save.mockImplementation((a) => Promise.resolve(a));

      await conSesion(sesionAdmin, () => service.completar(10));

      // Se actualiza SOLO la tarea de la finca activa (idfinca = 1)
      expect(mockTareaRepository.update).toHaveBeenCalledWith({ idtarea: 7, idfinca: 1 }, { estado: 'Completado' });
    });

    it('debe notificar por correo al administrador que asignó la tarea', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({ ...asignacionBase });
      mockAsignacionTareaRepository.save.mockImplementation((a) => Promise.resolve(a));

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
      mockAsignacionTareaRepository.save.mockImplementation((a) => Promise.resolve(a));

      await conSesion(sesionAdmin, () => service.completar(10));

      expect(mockMailService.notificarTareaCompletada).not.toHaveBeenCalled();
    });

    it('debe invalidar el caché de la tarea y el listado general tras completar', async () => {
      mockAsignacionTareaRepository.findOne.mockResolvedValue({ ...asignacionBase });
      mockAsignacionTareaRepository.save.mockImplementation((a) => Promise.resolve(a));

      await conSesion(sesionAdmin, () => service.completar(10));

      // Las claves de caché llevan la finca: el caché de una finca nunca se sirve a otra
      expect(mockCacheService.delete).toHaveBeenCalledWith('tareas_f1_7');
      expect(mockCacheService.delete).toHaveBeenCalledWith('tareas_f1_all');
    });
  });
});
