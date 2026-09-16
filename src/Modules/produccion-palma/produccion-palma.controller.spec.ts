import { Test, TestingModule } from '@nestjs/testing';
import { ProduccionPalmaController } from './produccion-palma.controller';
import { ProduccionPalmaService } from './produccion-palma.service';

describe('ProduccionPalmaController', () => {
  let controller: ProduccionPalmaController;

  const mockProduccionPalmaService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProduccionPalmaController],
      providers: [
        { provide: ProduccionPalmaService, useValue: mockProduccionPalmaService },
      ],
    }).compile();

    controller = module.get<ProduccionPalmaController>(ProduccionPalmaController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
