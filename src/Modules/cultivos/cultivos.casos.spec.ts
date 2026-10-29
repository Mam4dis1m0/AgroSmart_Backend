// src/Modules/cultivos/cultivos.casos.spec.ts
// Casos de prueba del informe · Módulo CULTIVOS (CP-C01 … CP-C09)
// Técnicas: clases de equivalencia, valores límite y camino básico (validarFechas / validarLimitePlan).
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CultivosService } from './cultivos.service';
import { Cultivo } from '../../Entidades/entities/Cultivo';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { PlanService } from '../../auth/plan.service';
import {
  mockPlanService,
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
  conSesion,
  sesionAdmin,
} from '../../test/mocks/common-providers.mock';

describe('CultivosService · casos del informe', () => {
  let service: CultivosService;
  const repo: any = createMockRepository();

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.assign(repo, {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ idcultivo: 1, ...x })),
      manager: {
        query: jest.fn().mockResolvedValue([{ '?column?': 1 }]), // supervisor válido
        getRepository: jest.fn().mockReturnValue({
          findOneBy: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(1),
        }),
      },
    });
    mockSyncService.isOnline.mockResolvedValue(true);
    mockPlanService.getPlan.mockResolvedValue({
      codigo: 'FREEMIUM',
      maxcultivos: 3,
    });

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CultivosService,
        { provide: getRepositoryToken(Cultivo), useValue: repo },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: PlanService, useValue: mockPlanService },
      ],
    }).compile();
    service = mod.get(CultivosService);
  });

  const crear = (dto: any) => conSesion(sesionAdmin, () => service.create(dto));

  // ── validarFechas (camino básico, V(G)=4) ──────────────────────────────────
  it('CP-C01 · cultivo válido (siembra < cosecha) se guarda', async () => {
    const r: any = await crear({
      tipo: 'Maíz',
      fechasiembra: '2026-03-01',
      fechacosechaestimada: '2026-08-01',
    });
    expect(r.idcultivo).toBe(1);
    expect(repo.save).toHaveBeenCalled();
  });

  it('CP-C02 · límite: cosecha = siembra es válida', async () => {
    await expect(
      crear({
        tipo: 'Maíz',
        fechasiembra: '2026-03-01',
        fechacosechaestimada: '2026-03-01',
      }),
    ).resolves.toBeDefined();
  });

  it('CP-C03 · límite: cosecha un día antes de la siembra → 400', async () => {
    await expect(
      crear({
        tipo: 'Maíz',
        fechasiembra: '2026-03-01',
        fechacosechaestimada: '2026-02-28',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('CP-C04 · solo siembra (sin cosecha estimada) es válido', async () => {
    await expect(
      crear({ tipo: 'Café', fechasiembra: '2026-03-01' }),
    ).resolves.toBeDefined();
  });

  // ── validarLimitePlan (V(G)=3) ─────────────────────────────────────────────
  it('CP-C05 · Freemium con 2 cultivos permite el tercero', async () => {
    repo.count.mockResolvedValue(2);
    await expect(crear({ tipo: 'Arroz' })).resolves.toBeDefined();
  });

  it('CP-C06 · Freemium con 3 cultivos bloquea el cuarto (403 LIMITE_PLAN_CULTIVOS)', async () => {
    repo.count.mockResolvedValue(3);
    await expect(crear({ tipo: 'Arroz' })).rejects.toThrow(ForbiddenException);
    await expect(crear({ tipo: 'Arroz' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LIMITE_PLAN_CULTIVOS' }),
    });
  });

  it('CP-C07 · Premium (maxcultivos = null) no tiene límite', async () => {
    mockPlanService.getPlan.mockResolvedValue({
      codigo: 'PREMIUM',
      maxcultivos: null,
    });
    repo.count.mockResolvedValue(50);
    await expect(crear({ tipo: 'Arroz' })).resolves.toBeDefined();
  });

  // ── supervisor ─────────────────────────────────────────────────────────────
  it('CP-C08 · supervisor que no es admin de la finca → 404', async () => {
    repo.manager.query.mockResolvedValue([]);
    await expect(
      crear({ tipo: 'Maíz', idadminsupervisor: 99 }),
    ).rejects.toThrow(NotFoundException);
  });

  // ── offline-first ──────────────────────────────────────────────────────────
  it('CP-C09 · sin internet: guarda en caché y encola (no toca la BD)', async () => {
    mockSyncService.isOnline.mockResolvedValue(false);
    const r: any = await crear({ tipo: 'Maíz' });
    expect(r._offline).toBe(true);
    expect(mockOfflineQueueService.add).toHaveBeenCalledWith(
      'cultivo',
      'CREATE',
      expect.any(Object),
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});
