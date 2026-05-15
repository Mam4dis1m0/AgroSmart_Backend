import { Test, TestingModule } from '@nestjs/testing';
import { ProduccionPalmaController } from './produccion-palma.controller';

describe('ProduccionPalmaController', () => {
  let controller: ProduccionPalmaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProduccionPalmaController],
    }).compile();

    controller = module.get<ProduccionPalmaController>(ProduccionPalmaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
