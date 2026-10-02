import { Module } from '@nestjs/common';
import { CosechasController } from './cosechas.controller';
import { CosechasService } from './cosechas.service';

@Module({
  controllers: [CosechasController],
  providers: [CosechasService],
})
export class CosechasModule {}
