import { Test, TestingModule } from '@nestjs/testing';
import { LotesController } from './lotes.controller';
import { LotesService } from './lotes.service';

describe('LotesController', () => {
  let controller: LotesController;

  const mockLotesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LotesController],
      providers: [
        { provide: LotesService, useValue: mockLotesService },
      ],
    }).compile();

    controller = module.get<LotesController>(LotesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
