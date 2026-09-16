import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PalmasService } from './palmas.service';
import { Palma } from '../../Entidades/entities/Palma';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

describe('PalmasService', () => {
  let service: PalmasService;
  const mockPalmaRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PalmasService,
        { provide: getRepositoryToken(Palma), useValue: mockPalmaRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
      ],
    }).compile();

    service = module.get<PalmasService>(PalmasService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
