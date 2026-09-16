import { Test, TestingModule } from '@nestjs/testing';
import { DetalleTareaController } from './detalle-tarea.controller';
import { DetalleTareaService } from './detalle-tarea.service';

describe('DetalleTareaController', () => {
  let controller: DetalleTareaController;

  const mockDetalleTareaService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DetalleTareaController],
      providers: [
        { provide: DetalleTareaService, useValue: mockDetalleTareaService },
      ],
    }).compile();

    controller = module.get<DetalleTareaController>(DetalleTareaController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
