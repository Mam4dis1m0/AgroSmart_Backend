// src/Modules/cosechas/cosechas.casos.spec.ts
// Casos de prueba del informe · Módulo COSECHAS (CP-H01 … CP-H07)
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { CosechasService } from './cosechas.service';
import { CreateCosechaDto } from '../../dto/cosecha.dto';
import { Cosecha } from '../../Entidades/entities/Cosecha';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
  conSesion,
  sesionAdmin,
} from '../../test/mocks/common-providers.mock';

describe('CosechasService · casos del informe', () => {
  let service: CosechasService;
  const repo: any = createMockRepository();
  const cultivoRepo = { findOneBy: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.assign(repo, {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ idcosecha: 1, ...x })),
      manager: { getRepository: jest.fn().mockReturnValue(cultivoRepo) },
    });
    mockSyncService.isOnline.mockResolvedValue(true);
    cultivoRepo.findOneBy.mockResolvedValue({
      idcultivo: 7,
      fechasiembra: '2026-03-01',
    });

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CosechasService,
        { provide: getRepositoryToken(Cosecha), useValue: repo },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
      ],
    }).compile();
    service = mod.get(CosechasService);
  });

  const crear = (dto: any) => conSesion(sesionAdmin, () => service.create(dto));

  it('CP-H01 · cosecha válida se registra con la finca y el admin de la sesión', async () => {
    const r: any = await crear({
      idcultivo: 7,
      fechacosecha: '2026-08-15',
      cantidad: 120,
      unidad: 'kg',
    });
    expect(r.idcosecha).toBe(1);
    expect(r.idfinca).toBe(sesionAdmin.idfinca);
    expect(r.idadminregistro).toBe(sesionAdmin.idusuario);
  });

  it('CP-H02 · cultivo inexistente en la finca → 404', async () => {
    cultivoRepo.findOneBy.mockResolvedValue(null);
    await expect(
      crear({ idcultivo: 999, fechacosecha: '2026-08-15', cantidad: 1 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('CP-H03 · límite: fecha de cosecha = siembra es válida', async () => {
    await expect(
      crear({ idcultivo: 7, fechacosecha: '2026-03-01', cantidad: 1 }),
    ).resolves.toBeDefined();
  });

  it('CP-H04 · límite: un día antes de la siembra → 400', async () => {
    await expect(
      crear({ idcultivo: 7, fechacosecha: '2026-02-28', cantidad: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('CP-H05 · cultivo sin fecha de siembra: no se valida la fecha', async () => {
    cultivoRepo.findOneBy.mockResolvedValue({
      idcultivo: 7,
      fechasiembra: null,
    });
    await expect(
      crear({ idcultivo: 7, fechacosecha: '2020-01-01', cantidad: 1 }),
    ).resolves.toBeDefined();
  });

  // ── DTO (class-validator) · clases de equivalencia y valores límite ────────
  const validar = async (body: any) => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    return pipe.transform(body, { type: 'body', metatype: CreateCosechaDto });
  };

  it.each([
    [
      'cantidad -0.01 (inválida)',
      { idcultivo: 7, fechacosecha: '2026-08-15', cantidad: -0.01 },
      false,
    ],
    [
      'cantidad 0 (límite, permitida por @Min(0))',
      { idcultivo: 7, fechacosecha: '2026-08-15', cantidad: 0 },
      true,
    ],
    [
      'cantidad 0.01 (válida)',
      { idcultivo: 7, fechacosecha: '2026-08-15', cantidad: 0.01 },
      true,
    ],
    [
      'unidad de 20 caracteres (límite)',
      {
        idcultivo: 7,
        fechacosecha: '2026-08-15',
        cantidad: 1,
        unidad: 'u'.repeat(20),
      },
      true,
    ],
    [
      'unidad de 21 caracteres (inválida)',
      {
        idcultivo: 7,
        fechacosecha: '2026-08-15',
        cantidad: 1,
        unidad: 'u'.repeat(21),
      },
      false,
    ],
    [
      'calidad de 51 caracteres (inválida)',
      {
        idcultivo: 7,
        fechacosecha: '2026-08-15',
        cantidad: 1,
        calidad: 'c'.repeat(51),
      },
      false,
    ],
    [
      'fecha con formato inválido',
      { idcultivo: 7, fechacosecha: '15/08/2026', cantidad: 1 },
      false,
    ],
  ])('CP-H06 · DTO: %s', async (_n, body, ok) => {
    if (ok) await expect(validar(body)).resolves.toBeDefined();
    else
      await expect(validar(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CP-H07 · sin internet: encola la cosecha', async () => {
    mockSyncService.isOnline.mockResolvedValue(false);
    const r: any = await crear({
      idcultivo: 7,
      fechacosecha: '2026-08-15',
      cantidad: 5,
    });
    expect(r._offline).toBe(true);
    expect(mockOfflineQueueService.add).toHaveBeenCalledWith(
      'cosecha',
      'CREATE',
      expect.any(Object),
    );
  });
});
