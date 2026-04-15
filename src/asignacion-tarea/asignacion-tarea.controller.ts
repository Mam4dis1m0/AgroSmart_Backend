import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { AsignacionTareaService } from './asignacion-tarea.service';
import { AsignacionTarea } from '../Entidades/entities/AsignacionTarea';

@Controller('asignacion-tarea')
export class AsignacionTareaController {
  constructor(private readonly asignacionTareaService: AsignacionTareaService) {}

  @Get()
  findAll() {
    return this.asignacionTareaService.findAll();
  }

  @Get('empleado/:id')
  findByEmpleado(@Param('id') id: string) {
    return this.asignacionTareaService.findByEmpleado(+id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.asignacionTareaService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<AsignacionTarea>) {
    return this.asignacionTareaService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<AsignacionTarea>) {
    return this.asignacionTareaService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.asignacionTareaService.remove(+id);
  }
}
