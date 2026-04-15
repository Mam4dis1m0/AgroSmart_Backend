import { Test, TestingModule } from '@nestjs/testing';
import { PalmasService } from './palmas.service';

describe('PalmasService', () => {
  let service: PalmasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PalmasService],
    }).compile();

    service = module.get<PalmasService>(PalmasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
