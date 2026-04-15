import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { CultivosService } from './cultivos.service';
import { CreateCultivoDto, UpdateCultivoDto } from '../../dto/cultivo.dto';

@Controller('cultivos')
export class CultivosController {
  constructor(private readonly cultivosService: CultivosService) {}

  @Get() findAll() { return this.cultivosService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.cultivosService.findOne(+id); }
  @Post() create(@Body() body: CreateCultivoDto) { return this.cultivosService.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: UpdateCultivoDto) { return this.cultivosService.update(+id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.cultivosService.remove(+id); }
}