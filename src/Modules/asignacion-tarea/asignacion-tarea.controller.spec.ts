import { Test, TestingModule } from '@nestjs/testing';
import { AsignacionTareaController } from './asignacion-tarea.controller';
import { AsignacionTareaService } from './asignacion-tarea.service';

describe('AsignacionTareaController', () => {
  let controller: AsignacionTareaController;

  const mockAsignacionTareaService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AsignacionTareaController],
      providers: [
        { provide: AsignacionTareaService, useValue: mockAsignacionTareaService },
      ],
    }).compile();

    controller = module.get<AsignacionTareaController>(AsignacionTareaController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
