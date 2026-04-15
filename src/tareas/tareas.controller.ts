import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { TareasService } from './tareas.service';
import { Tarea } from '../Entidades/entities/Tarea';

@Controller('tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Get()
  findAll() {
    return this.tareasService.findAll();
  }

  @Get('estado/:estado')
  findByEstado(@Param('estado') estado: string) {
    return this.tareasService.findByEstado(estado);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tareasService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<Tarea>) {
    return this.tareasService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Tarea>) {
    return this.tareasService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tareasService.remove(+id);
  }
}
