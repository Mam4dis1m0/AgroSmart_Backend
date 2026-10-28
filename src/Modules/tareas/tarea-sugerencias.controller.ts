import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from '../../auth/auth.decorators';
import { TenantContext } from '../../auth/tenant-context';
import { TareaSugerenciasService } from './tarea-sugerencias.service';

@Controller('api/v1/tareas')
export class TareaSugerenciasController {
  constructor(private readonly service: TareaSugerenciasService) {}

  /** Insumos que normalmente gasta esta labor, con la cantidad propuesta (el empleado confirma o cambia). */
  @Get(':id/insumos-sugeridos')
  insumos(@Param('id', ParseIntPipe) id: number) {
    return this.service.insumosSugeridos(TenantContext.requireFinca(), id, TenantContext.requireUser());
  }

  @Get(':id/pago-sugerido')
  @Roles('admin')
  pago(@Param('id', ParseIntPipe) id: number, @Query('idempleado', ParseIntPipe) idempleado: number) {
    return this.service.pagoSugerido(TenantContext.requireFinca(), id, idempleado, TenantContext.requireUser());
  }

  @Get(':id/costos')
  @Roles('admin')
  costos(@Param('id', ParseIntPipe) id: number) {
    return this.service.costos(TenantContext.requireFinca(), id, TenantContext.requireUser());
  }

  /** Costo y horas promedio de lo completado, por labor o por cultivo. */
  @Get('costos/resumen')
  @Roles('admin')
  resumen(@Query('agrupar') agrupar = 'actividad') {
    if (agrupar !== 'actividad' && agrupar !== 'cultivo') throw new BadRequestException('agrupar debe ser actividad o cultivo');
    return this.service.resumen(TenantContext.requireFinca(), agrupar);
  }
}
