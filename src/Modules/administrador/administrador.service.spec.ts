import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdministradorService } from './administrador.service';
import { Administrador } from '../../Entidades/entities/Administrador';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

describe('AdministradorService', () => {
  let service: AdministradorService;
  const mockAdministradorRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdministradorService,
        { provide: getRepositoryToken(Administrador), useValue: mockAdministradorRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
      ],
    }).compile();

    service = module.get<AdministradorService>(AdministradorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
