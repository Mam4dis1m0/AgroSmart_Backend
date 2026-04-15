import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { TareasService } from './tareas.service';
import { CreateTareaDto, UpdateTareaDto } from '../../dto/tarea.dto';

@Controller('tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Get() findAll() { return this.tareasService.findAll(); }
  @Get('estado/:estado') findByEstado(@Param('estado') estado: string) { return this.tareasService.findByEstado(estado); }
  @Get(':id') findOne(@Param('id') id: string) { return this.tareasService.findOne(+id); }
  @Post() create(@Body() body: CreateTareaDto) { return this.tareasService.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: UpdateTareaDto) { return this.tareasService.update(+id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.tareasService.remove(+id); }
}