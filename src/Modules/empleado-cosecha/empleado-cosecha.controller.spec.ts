import { Test, TestingModule } from '@nestjs/testing';
import { EmpleadoCosechaController } from './empleado-cosecha.controller';
import { EmpleadoCosechaService } from './empleado-cosecha.service';

describe('EmpleadoCosechaController', () => {
  let controller: EmpleadoCosechaController;

  const mockEmpleadoCosechaService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmpleadoCosechaController],
      providers: [
        { provide: EmpleadoCosechaService, useValue: mockEmpleadoCosechaService },
      ],
    }).compile();

    controller = module.get<EmpleadoCosechaController>(EmpleadoCosechaController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
