import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InsumosService } from './insumos.service';
import { Insumo } from '../../Entidades/entities/Insumo';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { MailService } from '../../mail/mail.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService, mockMailService,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

describe('InsumosService', () => {
  let service: InsumosService;
  const mockInsumoRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsumosService,
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<InsumosService>(InsumosService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODO REPRESENTATIVO #2: update()
  // Se eligió porque implementa una regla de negocio clave del proyecto:
  // comparar stock actual vs. stock mínimo y disparar (o no) un correo de
  // alerta al administrador — además del comportamiento online/offline.
  // ─────────────────────────────────────────────────────────────────────────
  describe('update() — alerta de stock bajo', () => {
    const entityExistente = {
      idinsumo: 5,
      nombre: 'Fertilizante NPK',
      stockactual: 50,
      stockminimo: 10,
      tipo: 'Fertilizante',
      unidadmedida: 'kg',
    };

    const insumoConAdminYEmail = {
      ...entityExistente,
      stockactual: 3, // por debajo del mínimo tras la actualización
      idadminregistro: { idusuario2: { email: 'admin@agrosmart.com' } },
    };

    it('en modo OFFLINE debe encolar el cambio y NO enviar correo ni verificar stock', async () => {
      mockSyncService.isOnline.mockResolvedValue(false);
      // cache.get devuelve null por defecto (mock compartido) → el método
      // usa su propio fallback interno, que es lo que queremos probar aquí.

      await service.update(5, { stockactual: 3 } as any);

      expect(mockMailService.notificarStockBajo).not.toHaveBeenCalled();
      expect(mockOfflineQueueService.add).toHaveBeenCalled();
    });

    it('en modo ONLINE, si el stock queda por debajo del mínimo, debe enviar correo al admin', async () => {
      mockSyncService.isOnline.mockResolvedValue(true);
      mockInsumoRepository.findOneByOrFail.mockResolvedValue({ ...entityExistente });
      mockInsumoRepository.save.mockResolvedValue({ ...entityExistente, stockactual: 3 });
      mockInsumoRepository.findOne.mockResolvedValue(insumoConAdminYEmail);

      await service.update(5, { stockactual: 3 } as any);

      expect(mockMailService.notificarStockBajo).toHaveBeenCalledWith(
        'admin@agrosmart.com',
        expect.objectContaining({
          nombreInsumo: 'Fertilizante NPK',
          stockActual: 3,
          stockMinimo: 10,
        }),
      );
    });

    it('en modo ONLINE, si el stock queda por ENCIMA del mínimo, NO debe enviar correo', async () => {
      const insumoStockOk = {
        ...entityExistente,
        stockactual: 80,
        idadminregistro: { idusuario2: { email: 'admin@agrosmart.com' } },
      };
      mockSyncService.isOnline.mockResolvedValue(true);
      mockInsumoRepository.findOneByOrFail.mockResolvedValue({ ...entityExistente });
      mockInsumoRepository.save.mockResolvedValue({ ...entityExistente, stockactual: 80 });
      mockInsumoRepository.findOne.mockResolvedValue(insumoStockOk);

      await service.update(5, { stockactual: 80 } as any);

      expect(mockMailService.notificarStockBajo).not.toHaveBeenCalled();
    });

    it('si el stock está bajo pero el admin no tiene email registrado, NO debe intentar enviar correo', async () => {
      const insumoSinEmail = {
        ...entityExistente,
        stockactual: 3,
        idadminregistro: { idusuario2: { email: '' } },
      };
      mockSyncService.isOnline.mockResolvedValue(true);
      mockInsumoRepository.findOneByOrFail.mockResolvedValue({ ...entityExistente });
      mockInsumoRepository.save.mockResolvedValue({ ...entityExistente, stockactual: 3 });
      mockInsumoRepository.findOne.mockResolvedValue(insumoSinEmail);

      await service.update(5, { stockactual: 3 } as any);

      expect(mockMailService.notificarStockBajo).not.toHaveBeenCalled();
    });
  });
});
