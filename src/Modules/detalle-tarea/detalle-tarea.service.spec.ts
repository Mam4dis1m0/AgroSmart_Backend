import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DetalleTareaService } from './detalle-tarea.service';
import { DetalleTarea } from '../../Entidades/entities/DetalleTarea';
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

describe('DetalleTareaService', () => {
  let service: DetalleTareaService;
  const mockDetalleTareaRepository = createMockRepository();
  const mockInsumoRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetalleTareaService,
        { provide: getRepositoryToken(DetalleTarea), useValue: mockDetalleTareaRepository },
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: OfflineQueueService, useValue: mockOfflineQueueService },
        { provide: SyncService, useValue: mockSyncService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<DetalleTareaService>(DetalleTareaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
