import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { CultivosService } from './cultivos.service';
import { Cultivo } from '../Entidades/entities/Cultivo';

@Controller('cultivos')
export class CultivosController {
  constructor(private readonly service: CultivosService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string)
   { return this.service.findOne(+id); }

  @Post() create(@Body() body: Partial<Cultivo>) 
  { return this.service.create(body); }

  @Put(':id') update(@Param('id') id: string, @Body() body: Partial<Cultivo>) 
  { return this.service.update(+id, body); }

  @Delete(':id') remove(@Param('id') id: string)
   { return this.service.remove(+id); }
}
