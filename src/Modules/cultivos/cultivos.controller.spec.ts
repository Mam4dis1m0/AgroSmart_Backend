import { Test, TestingModule } from '@nestjs/testing';
import { CultivosController } from './cultivos.controller';
import { CultivosService } from './cultivos.service';

describe('CultivosController', () => {
  let controller: CultivosController;

  const mockCultivosService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CultivosController],
      providers: [
        { provide: CultivosService, useValue: mockCultivosService },
      ],
    }).compile();

    controller = module.get<CultivosController>(CultivosController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // TODO: agrega aquí los tests de cada endpoint, por ejemplo:
  // it('debería retornar la lista de cultivos', async () => {
  //   mockCultivosService.findAll.mockResolvedValue([{ id: 1, nombre: 'Palma' }]);
  //   const result = await controller.findAll();
  //   expect(result).toEqual([{ id: 1, nombre: 'Palma' }]);
  //   expect(mockCultivosService.findAll).toHaveBeenCalled();
  // });
});
