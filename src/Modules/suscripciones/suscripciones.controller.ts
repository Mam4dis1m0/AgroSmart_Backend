import { Controller, Get, Post } from '@nestjs/common';
import { Roles, SinFinca } from '../../auth/auth.decorators';
import { CurrentUser } from '../../auth/auth.decorators';
import { AuthUser, TenantContext } from '../../auth/tenant-context';
import { SuscripcionesService } from './suscripciones.service';

@Controller('api/v1')
export class SuscripcionesController {
  constructor(private readonly service: SuscripcionesService) {}

  // Comparativo Freemium / Premium (también lo ve el comprador al ofrecerle actualizar)
  @Get('planes')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  planes() {
    return this.service.listarPlanes();
  }

  // GESTIONAR SUSCRIPCIÓN (CU-42)
  @Get('suscripcion')
  @Roles('admin')
  miSuscripcion() {
    return this.service.miSuscripcion(TenantContext.requireFinca());
  }

  @Post('suscripcion/contratar')
  @Roles('admin')
  contratar(@CurrentUser() user: AuthUser) {
    return this.service.contratar(TenantContext.requireFinca(), user);
  }

  @Post('suscripcion/cancelar')
  @Roles('admin')
  cancelar() {
    return this.service.cancelar(TenantContext.requireFinca());
  }

  @Get('suscripcion/pagos')
  @Roles('admin')
  pagos() {
    return this.service.pagos(TenantContext.requireFinca());
  }
}
