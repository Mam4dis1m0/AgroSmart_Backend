import { Test, TestingModule } from '@nestjs/testing';
import { EmpleadoCosechaService } from './empleado-cosecha.service';

describe('EmpleadoCosechaService', () => {
  let service: EmpleadoCosechaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmpleadoCosechaService],
    }).compile();

    service = module.get<EmpleadoCosechaService>(EmpleadoCosechaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
