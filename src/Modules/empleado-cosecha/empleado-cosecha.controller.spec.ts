import { Test, TestingModule } from '@nestjs/testing';
import { EmpleadoCosechaController } from './empleado-cosecha.controller';

describe('EmpleadoCosechaController', () => {
  let controller: EmpleadoCosechaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmpleadoCosechaController],
    }).compile();

    controller = module.get<EmpleadoCosechaController>(EmpleadoCosechaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
