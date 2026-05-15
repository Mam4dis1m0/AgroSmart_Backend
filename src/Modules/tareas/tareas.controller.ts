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
//import { AuthGuard }  from '../auth/guards/auth.guard';   // ← ajusta ruta si difiere
//import { RolesGuard } from '../auth/guards/roles.guard';  // ← ajusta ruta si difiere
//import { Roles }      from '../auth/decorators/roles.decorator';

@Controller('api/v1/tareas')
//@UseGuards(AuthGuard, RolesGuard)  // protege todos los endpoints del controlador
//@Roles('admin')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  // ── Sin cambios ───────────────────────────────────────────────────────────

  @Get()
  findAll() { return this.tareasService.findAll(); }

  // ⚠ findByEstado debe ir ANTES de ':id' para que NestJS no lo confunda con un id
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

  // ── NUEVO ─────────────────────────────────────────────────────────────────

  /**
   * PATCH /api/v1/tareas/:id/asignar
   * Body: { "empleadoId": number | null }
   *
   * Asigna o desasigna un empleado a una tarea.
   * Valida que el empleado exista antes de asignar.
   * Devuelve la tarea actualizada con empleado anidado.
   */
  @Patch(':id/asignar')
  asignar(
    @Param('id') id: string,
    @Body() dto: AsignarTareaDto,
  ) {
    return this.tareasService.asignar(+id, dto);
  }
}