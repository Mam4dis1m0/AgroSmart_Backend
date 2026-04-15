import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { AsignacionTareaService } from './asignacion-tarea.service';
import { AsignacionTarea } from '../Entidades/entities/AsignacionTarea';

@Controller('asignacion-tarea')
export class AsignacionTareaController {
  constructor(private readonly service: AsignacionTareaService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<AsignacionTarea>) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<AsignacionTarea>) {
    return this.service.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
