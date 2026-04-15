import { Test, TestingModule } from '@nestjs/testing';
import { PalmasController } from './palmas.controller';

describe('PalmasController', () => {
  let controller: PalmasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PalmasController],
    }).compile();

    controller = module.get<PalmasController>(PalmasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
