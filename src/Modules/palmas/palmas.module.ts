import { Module } from '@nestjs/common';
import { PalmasService } from './palmas.service';
import { PalmasController } from './palmas.controller';

@Module({
  controllers: [PalmasController],
  providers: [PalmasService],
})
export class PalmasModule {}
