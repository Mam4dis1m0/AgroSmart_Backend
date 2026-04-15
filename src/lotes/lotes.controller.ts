import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { LotesService } from './lotes.service';
import { Lote } from '../Entidades/entities/Lote';

@Controller('lotes')
export class LotesController {
  constructor(private readonly service: LotesService) {}

  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
  @Post() create(@Body() body: Partial<Lote>) {
    return this.service.create(body);
  }
  @Put(':id') update(@Param('id') id: string, @Body() body: Partial<Lote>) {
    return this.service.update(+id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
