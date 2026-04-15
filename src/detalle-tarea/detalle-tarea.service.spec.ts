import { Test, TestingModule } from '@nestjs/testing';
import { DetalleTareaService } from './detalle-tarea.service';

describe('DetalleTareaService', () => {
  let service: DetalleTareaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DetalleTareaService],
    }).compile();

    service = module.get<DetalleTareaService>(DetalleTareaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
