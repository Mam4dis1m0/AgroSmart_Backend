import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LotesService } from './lotes.service';
import { Lote } from '../../Entidades/entities/Lote';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

describe('LotesService', () => {
  let service: LotesService;
  const mockLoteRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LotesService,
        { provide: getRepositoryToken(Lote), useValue: mockLoteRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
      ],
    }).compile();

    service = module.get<LotesService>(LotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
