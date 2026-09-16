import { Test, TestingModule } from '@nestjs/testing';
import { EmpleadoController } from './empleado.controller';
import { EmpleadoService } from './empleado.service';

describe('EmpleadoController', () => {
  let controller: EmpleadoController;

  const mockEmpleadoService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmpleadoController],
      providers: [
        { provide: EmpleadoService, useValue: mockEmpleadoService },
      ],
    }).compile();

    controller = module.get<EmpleadoController>(EmpleadoController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
