import { Test, TestingModule } from '@nestjs/testing';
import { LotesController } from './lotes.controller';

describe('LotesController', () => {
  let controller: LotesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LotesController],
    }).compile();

    controller = module.get<LotesController>(LotesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
