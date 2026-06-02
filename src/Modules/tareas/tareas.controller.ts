// src/tareas/tareas.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TareasService } from './tareas.service';
import { CreateTareaDto, UpdateTareaDto, AsignarTareaDto } from '../../dto/tarea.dto';

@Controller('api/v1/tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Get()
  findAll() { return this.tareasService.findAll(); }

  @Get('estado/:estado')
  findByEstado(@Param('estado') estado: string) {
    return this.tareasService.findByEstado(estado);
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.tareasService.findOne(+id); }

  @Post()
  create(@Body() body: CreateTareaDto) { return this.tareasService.create(body); }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateTareaDto) {
    return this.tareasService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.tareasService.remove(+id); }

  @Patch(':id/asignar')
  asignar(@Param('id') id: string, @Body() dto: AsignarTareaDto) {
    return this.tareasService.asignar(+id, dto);
  }

  // ── NUEVO ─────────────────────────────────────────────────────────────────
  /**
   * PATCH /api/v1/tareas/:id/completar
   * Cambia el estado de la asignación a "Completado"
   * y le envía un email al admin avisando que terminó.
   */
  @Patch(':id/completar')
  completar(@Param('id') id: string) {
    return this.tareasService.completar(+id);
  }
}