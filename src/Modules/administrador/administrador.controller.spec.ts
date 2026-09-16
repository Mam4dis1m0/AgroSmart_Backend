import { Test, TestingModule } from '@nestjs/testing';
import { AdministradorController } from './administrador.controller';
import { AdministradorService } from './administrador.service';

describe('AdministradorController', () => {
  let controller: AdministradorController;

  const mockAdministradorService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdministradorController],
      providers: [
        { provide: AdministradorService, useValue: mockAdministradorService },
      ],
    }).compile();

    controller = module.get<AdministradorController>(AdministradorController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
