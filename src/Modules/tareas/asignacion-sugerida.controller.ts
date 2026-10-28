import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { Roles } from '../../auth/auth.decorators';
import { TenantContext } from '../../auth/tenant-context';
import { AsignacionSugeridaService } from './asignacion-sugerida.service';

const MODOS = ['manual', 'sugerida', 'automatica'];

@Controller('api/v1/tareas')
export class AsignacionSugeridaController {
  constructor(private readonly sugerida: AsignacionSugeridaService) {}

  /** A quién conviene asignar la tarea, con el motivo de cada sugerencia. */
  @Get(':id/sugerencias')
  @Roles('admin')
  sugerencias(@Param('id', ParseIntPipe) id: number) {
    return this.sugerida.sugerir(TenantContext.requireFinca(), id);
  }

  @Get('config/modo-asignacion')
  @Roles('admin')
  async modo() {
    return { modo: await this.sugerida.modoAsignacion(TenantContext.requireFinca()) };
  }

  @Put('config/modo-asignacion')
  @Roles('admin')
  async cambiarModo(@Body('modo') modo: string) {
    if (!MODOS.includes(modo)) throw new BadRequestException('Modo de asignación inválido');
    return { modo: await this.sugerida.cambiarModo(TenantContext.requireFinca(), modo) };
  }
}
