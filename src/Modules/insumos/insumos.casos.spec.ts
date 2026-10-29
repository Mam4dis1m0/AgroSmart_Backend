// src/Modules/insumos/insumos.casos.spec.ts
// Casos de prueba del informe · Módulo INSUMOS (CP-I01 … CP-I09)
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { InsumosService } from './insumos.service';
import { CreateCompraInsumoDto } from '../../dto/insumo.dto';
import { Insumo } from '../../Entidades/entities/Insumo';
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

describe('InsumosService · casos del informe', () => {
  let service: InsumosService;
  const repo: any = createMockRepository();

  const base = {
    idinsumo: 5,
    nombre: 'Fertilizante NPK',
    stockactual: 50,
    stockminimo: 10,
    tipo: 'Fertilizante',
    unidadmedida: 'kg',
  };
  const conAdmin = (stock: number) => ({
    ...base,
    stockactual: stock,
    idadminregistro: { idusuario2: { email: 'admin@agrosmart.com' } },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService.isOnline.mockResolvedValue(true);
    repo.findOneBy.mockResolvedValue({ ...base });
    repo.save.mockImplementation(async (x: any) => x);
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        InsumosService,
        { provide: getRepositoryToken(Insumo), useValue: repo },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();
    service = mod.get(InsumosService);
  });

  const actualizar = (stock: number) =>
    conSesion(sesionAdmin, () =>
      service.update(5, { stockactual: stock } as any),
    );

  // ── update(): camino básico V(G)=4 ─────────────────────────────────────────
  it('CP-I01 · stock por debajo del mínimo envía correo al admin', async () => {
    repo.findOne.mockResolvedValue(conAdmin(3));
    await actualizar(3);
    expect(mockMailService.notificarStockBajo).toHaveBeenCalledTimes(1);
  });

  it('CP-I02 · LÍMITE stock = mínimo: update() sí alerta (<=)', async () => {
    repo.findOne.mockResolvedValue(conAdmin(10));
    await actualizar(10);
    expect(mockMailService.notificarStockBajo).toHaveBeenCalledTimes(1);
  });

  it('CP-I03 · stock mínimo + 1 no alerta', async () => {
    repo.findOne.mockResolvedValue(conAdmin(11));
    await actualizar(11);
    expect(mockMailService.notificarStockBajo).not.toHaveBeenCalled();
  });

  it('CP-I04 · stock bajo sin ningún correo disponible no intenta enviar', async () => {
    repo.findOne.mockResolvedValue({
      ...base,
      stockactual: 3,
      idadminregistro: { idusuario2: { email: '' } },
    });
    await conSesion({ ...sesionAdmin, email: '' }, () =>
      service.update(5, { stockactual: 3 } as any),
    );
    expect(mockMailService.notificarStockBajo).not.toHaveBeenCalled();
  });

  it('CP-I05 · sin internet: encola y no envía correo', async () => {
    mockSyncService.isOnline.mockResolvedValue(false);
    await actualizar(3);
    expect(mockOfflineQueueService.add).toHaveBeenCalled();
    expect(mockMailService.notificarStockBajo).not.toHaveBeenCalled();
  });

  // ── registrarCompra() ──────────────────────────────────────────────────────
  it('CP-I06 · registrar compra sin internet → 503', async () => {
    mockSyncService.isOnline.mockResolvedValue(false);
    await expect(
      conSesion(sesionAdmin, () =>
        service.registrarCompra(5, {
          cantidad: 10,
          costounitario: 1000,
        } as any),
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('CP-I07 · registrar compra de un insumo que no es de la finca → 404', async () => {
    repo.manager = {
      transaction: jest.fn(async (fn: any) =>
        fn({ findOne: jest.fn().mockResolvedValue(null) }),
      ),
    };
    await expect(
      conSesion(sesionAdmin, () =>
        service.registrarCompra(99, {
          cantidad: 10,
          costounitario: 1000,
        } as any),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // ── DTO de compra: clases de equivalencia y límites ────────────────────────
  const validar = (body: any) =>
    new ValidationPipe({ whitelist: true, transform: true }).transform(body, {
      type: 'body',
      metatype: CreateCompraInsumoDto,
    });

  it.each([
    ['cantidad 0 (límite inválido)', { cantidad: 0, costounitario: 10 }, false],
    [
      'cantidad 0.01 (límite válido)',
      { cantidad: 0.01, costounitario: 10 },
      true,
    ],
    ['cantidad negativa', { cantidad: -5, costounitario: 10 }, false],
    ['costo unitario -0.01', { cantidad: 5, costounitario: -0.01 }, false],
    [
      'costo unitario 0 (límite válido)',
      { cantidad: 5, costounitario: 0 },
      true,
    ],
    [
      'proveedor de 151 caracteres',
      { cantidad: 5, costounitario: 1, proveedor: 'p'.repeat(151) },
      false,
    ],
    [
      'fecha con formato inválido',
      { cantidad: 5, costounitario: 1, fechacompra: '23-10-2026' },
      false,
    ],
  ])('CP-I08 · DTO compra: %s', async (_n, body, ok) => {
    if (ok) await expect(validar(body)).resolves.toBeDefined();
    else
      await expect(validar(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
