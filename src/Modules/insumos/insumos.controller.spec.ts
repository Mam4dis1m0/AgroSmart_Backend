import { Test, TestingModule } from '@nestjs/testing';
import { InsumosController } from './insumos.controller';
import { InsumosService } from './insumos.service';

describe('InsumosController', () => {
  let controller: InsumosController;

  const mockInsumosService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InsumosController],
      providers: [
        { provide: InsumosService, useValue: mockInsumosService },
      ],
    }).compile();

    controller = module.get<InsumosController>(InsumosController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
