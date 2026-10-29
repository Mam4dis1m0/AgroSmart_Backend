// src/Modules/tareas/tareas.casos.spec.ts
// Casos de prueba del informe · Módulo TAREAS (CP-T01 … CP-T09)
// Se ejercita update() (online) porque ahí viven validarCultivo(), exigirAsignada() y las reglas del empleado.
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  sesionEmpleado,
} from '../../test/mocks/common-providers.mock';

describe('TareasService · casos del informe', () => {
  let service: TareasService;
  const tareaRepo: any = createMockRepository();
  const asigRepo: any = createMockRepository();
  const cultivoRepo = { findOneBy: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService.isOnline.mockResolvedValue(true);
    tareaRepo.manager = {
      getRepository: jest.fn().mockReturnValue(cultivoRepo),
      query: jest.fn(),
    };
    tareaRepo.findOneBy.mockResolvedValue({
      idtarea: 1,
      estado: 'Pendiente',
      fechaprogramada: '2026-04-01',
    });
    tareaRepo.save.mockImplementation(async (x: any) => x);
    asigRepo.count.mockResolvedValue(1);
    cultivoRepo.findOneBy.mockResolvedValue({
      idcultivo: 3,
      activo: true,
      fechasiembra: '2026-03-01',
    });

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TareasService,
        { provide: getRepositoryToken(Tarea), useValue: tareaRepo },
        {
          provide: getRepositoryToken(Empleado),
          useValue: createMockRepository(),
        },
        { provide: getRepositoryToken(AsignacionTarea), useValue: asigRepo },
        {
          provide: getRepositoryToken(Insumo),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(DetalleTarea),
          useValue: createMockRepository(),
        },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();
    service = mod.get(TareasService);
  });

  const admin = (dto: any) =>
    conSesion(sesionAdmin, () => service.update(1, dto));
  const empleado = (dto: any) =>
    conSesion(sesionEmpleado, () => service.update(1, dto));

  // ── validarCultivo() · camino básico V(G)=7 ────────────────────────────────
  it('CP-T01 · T1: sin cultivo en el cambio, no se valida nada', async () => {
    await expect(admin({ tipoactividad: 'Riego' })).resolves.toBeDefined();
    expect(cultivoRepo.findOneBy).not.toHaveBeenCalled();
  });
  it('CP-T02 · T2: cultivo inexistente en la finca → 404', async () => {
    cultivoRepo.findOneBy.mockResolvedValue(null);
    await expect(admin({ idcultivo: 99 })).rejects.toThrow(NotFoundException);
  });
  it('CP-T03 · T3: cultivo inactivo → 400', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({ idcultivo: 3, activo: false });
    await expect(admin({ idcultivo: 3 })).rejects.toThrow(BadRequestException);
  });
  it('CP-T04 · T4: fecha un día antes de la siembra → 400', async () => {
    await expect(
      admin({ idcultivo: 3, fechaprogramada: '2026-02-28' }),
    ).rejects.toThrow(BadRequestException);
  });
  it('CP-T05 · T7/límite: fecha = siembra es válida', async () => {
    await expect(
      admin({ idcultivo: 3, fechaprogramada: '2026-03-01' }),
    ).resolves.toBeDefined();
  });
  it('CP-T06 · T6: cultivo sin fecha de siembra → no se compara la fecha', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({
      idcultivo: 3,
      activo: true,
      fechasiembra: null,
    });
    await expect(
      admin({ idcultivo: 3, fechaprogramada: '2000-01-01' }),
    ).resolves.toBeDefined();
  });

  // ── reglas del empleado (CU-10) ────────────────────────────────────────────
  it('CP-T07 · empleado que intenta cambiar otro campo distinto del estado → 403', async () => {
    await expect(empleado({ costototal: 1 })).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('CP-T08 · empleado sobre una tarea que no le asignaron → 403', async () => {
    asigRepo.count.mockResolvedValue(0);
    await expect(empleado({ estado: 'En progreso' })).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('CP-T09 · empleado no puede reabrir una tarea ya completada → 400', async () => {
    tareaRepo.findOneBy.mockResolvedValue({ idtarea: 1, estado: 'Completado' });
    await expect(empleado({ estado: 'En progreso' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
