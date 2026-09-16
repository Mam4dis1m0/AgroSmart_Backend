/**
 * PLANTILLA para *.service.spec.ts
 *
 * Pasos para adaptarla a cada módulo:
 * 1. Reemplaza NOMBRE por el nombre real (ej. Lotes, Palmas, Auditoria, etc.)
 * 2. Reemplaza ENTIDAD por la entidad TypeORM real que usa ese servicio.
 * 3. Ajusta la ruta del import de la entidad y de los servicios transversales
 *    según la ubicación real del archivo.
 * 4. Si el servicio depende de OTRO repositorio o servicio (revisa el mensaje
 *    "Nest can't resolve dependencies of ... (?, X, Y, Z)" del log de error:
 *    todo lo que aparece dentro del paréntesis después del "?" debe agregarse
 *    aquí como provider mockeado también).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NOMBREService } from './NOMBRE.service';
import { ENTIDAD } from './entities/ENTIDAD_MINUSCULA.entity';
import { CacheService } from '../../cache/cache.service';
import { OfflineQueueService } from '../../offline-queue/offline-queue.service';
import { SyncService } from '../../sync/sync.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
} from '../../../test/mocks/common-providers.mock';

describe('NOMBREService', () => {
  let service: NOMBREService;
  const mockENTIDADRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NOMBREService,
        { provide: getRepositoryToken(ENTIDAD), useValue: mockENTIDADRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        // Si el log menciona más dependencias (otro repo, MailService, etc.),
        // agrégalas aquí con el mismo patrón { provide: X, useValue: mockX }.
      ],
    }).compile();

    service = module.get<NOMBREService>(NOMBREService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
