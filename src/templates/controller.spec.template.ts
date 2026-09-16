/**
 * PLANTILLA para *.controller.spec.ts
 * Reemplaza NOMBRE por el nombre real del módulo (ej. Usuarios, Lotes, Palmas, etc.)
 * y agrega/quita métodos del mock según los que tenga el Service real.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NOMBREController } from './NOMBRE.controller';
import { NOMBREService } from './NOMBRE.service';

describe('NOMBREController', () => {
  let controller: NOMBREController;

  const mockNOMBREService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NOMBREController],
      providers: [
        { provide: NOMBREService, useValue: mockNOMBREService },
      ],
    }).compile();

    controller = module.get<NOMBREController>(NOMBREController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
