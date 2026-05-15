import { Test, TestingModule } from '@nestjs/testing';
import { DetalleTareaController } from './detalle-tarea.controller';

describe('DetalleTareaController', () => {
  let controller: DetalleTareaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DetalleTareaController],
    }).compile();

    controller = module.get<DetalleTareaController>(DetalleTareaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
