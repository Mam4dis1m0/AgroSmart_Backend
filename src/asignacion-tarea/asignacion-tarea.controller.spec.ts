import { Test, TestingModule } from '@nestjs/testing';
import { AsignacionTareaController } from './asignacion-tarea.controller';

describe('AsignacionTareaController', () => {
  let controller: AsignacionTareaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AsignacionTareaController],
    }).compile();

    controller = module.get<AsignacionTareaController>(AsignacionTareaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
