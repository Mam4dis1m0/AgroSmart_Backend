import { Test, TestingModule } from '@nestjs/testing';
import { PalmasController } from './palmas.controller';
import { PalmasService } from './palmas.service';

describe('PalmasController', () => {
  let controller: PalmasController;

  const mockPalmasService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PalmasController],
      providers: [
        { provide: PalmasService, useValue: mockPalmasService },
      ],
    }).compile();

    controller = module.get<PalmasController>(PalmasController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
