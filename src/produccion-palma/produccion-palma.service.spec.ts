import { Test, TestingModule } from '@nestjs/testing';
import { ProduccionPalmaService } from './produccion-palma.service';

describe('ProduccionPalmaService', () => {
  let service: ProduccionPalmaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProduccionPalmaService],
    }).compile();

    service = module.get<ProduccionPalmaService>(ProduccionPalmaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
