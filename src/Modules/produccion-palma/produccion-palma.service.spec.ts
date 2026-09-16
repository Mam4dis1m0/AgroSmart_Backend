import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProduccionPalmaService } from './produccion-palma.service';
import { ProduccionPalma } from '../../Entidades/entities/ProduccionPalma';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

describe('ProduccionPalmaService', () => {
  let service: ProduccionPalmaService;
  const mockProduccionPalmaRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProduccionPalmaService,
        { provide: getRepositoryToken(ProduccionPalma), useValue: mockProduccionPalmaRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
      ],
    }).compile();

    service = module.get<ProduccionPalmaService>(ProduccionPalmaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
