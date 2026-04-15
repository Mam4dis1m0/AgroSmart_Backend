import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { InsumosService } from './insumos.service';
import { Insumo } from '../Entidades/entities/Insumo';

@Controller('insumos')
export class InsumosController {
  constructor(private readonly service: InsumosService) {}

  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
  @Post() create(@Body() body: Partial<Insumo>) {
    return this.service.create(body);
  }
  @Put(':id') update(@Param('id') id: string, @Body() body: Partial<Insumo>) {
    return this.service.update(+id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
