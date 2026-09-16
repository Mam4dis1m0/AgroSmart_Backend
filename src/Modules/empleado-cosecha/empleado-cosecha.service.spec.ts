import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmpleadoCosechaService } from './empleado-cosecha.service';
import { EmpleadoCosecha } from '../../Entidades/entities/EmpleadoCosecha';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import {
  mockCacheService,
  mockOfflineQueueService,
  mockSyncService,
  createMockRepository,
} from '../../test/mocks/common-providers.mock';

describe('EmpleadoCosechaService', () => {
  let service: EmpleadoCosechaService;
  const mockEmpleadoCosechaRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpleadoCosechaService,
        { provide: getRepositoryToken(EmpleadoCosecha), useValue: mockEmpleadoCosechaRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
      ],
    }).compile();

    service = module.get<EmpleadoCosechaService>(EmpleadoCosechaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
