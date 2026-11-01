import { Module } from '@nestjs/common';
import { VozController } from './voz.controller';
import { VozService } from './voz.service';

@Module({ controllers: [VozController], providers: [VozService] })
export class VozModule {}
