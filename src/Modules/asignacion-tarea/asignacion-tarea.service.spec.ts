import { Test, TestingModule } from '@nestjs/testing';
import { AsignacionTareaService } from './asignacion-tarea.service';

describe('AsignacionTareaService', () => {
  let service: AsignacionTareaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AsignacionTareaService],
    }).compile();

    service = module.get<AsignacionTareaService>(AsignacionTareaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
