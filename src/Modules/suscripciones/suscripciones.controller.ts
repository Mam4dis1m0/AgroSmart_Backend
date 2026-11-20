import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles, SinFinca } from '../../auth/auth.decorators';
import { CurrentUser } from '../../auth/auth.decorators';
import { AuthUser, TenantContext } from '../../auth/tenant-context';
import { SuscripcionesService } from './suscripciones.service';

export class ContratarPlanDto {
  /** NEQUI (transferencia revisada a mano) o SIMULADO (solo desarrollo). */
  @IsOptional() @IsIn(['NEQUI', 'SIMULADO']) metodo?: string;
  /** Referencia que aparece en el comprobante de Nequi. */
  @IsOptional() @IsString() @MaxLength(80) referencia?: string;
  /** Foto del comprobante como data URL (data:image/...;base64,...). */
  @IsOptional() @IsString() comprobante?: string;
}

@Controller('api/v1')
export class SuscripcionesController {
  constructor(private readonly service: SuscripcionesService) {}

  // Comparativo Freemium / Premium (también lo ve el comprador al ofrecerle actualizar)
  @Get('planes')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  planes(@CurrentUser() user: AuthUser) {
    return this.service.listarPlanes(user);
  }

  // ── Premium del comprador ──
  @Get('comprador/suscripcion')
  @Roles('comprador')
  @SinFinca()
  miSuscripcionComprador(@CurrentUser() user: AuthUser) {
    return this.service.miSuscripcionComprador(user.idusuario);
  }

  @Post('comprador/suscripcion/contratar')
  @Roles('comprador')
  @SinFinca()
  contratarComprador(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true })) body: ContratarPlanDto,
  ) {
    return this.service.contratarComprador(user, body);
  }

  @Get('comprador/suscripcion/pagos')
  @Roles('comprador')
  @SinFinca()
  pagosComprador(@CurrentUser() user: AuthUser) {
    return this.service.pagosComprador(user.idusuario);
  }

  // GESTIONAR SUSCRIPCIÓN (CU-42)
  @Get('suscripcion')
  @Roles('admin')
  miSuscripcion() {
    return this.service.miSuscripcion(TenantContext.requireFinca());
  }

  @Get('suscripcion/metodos-pago')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  metodosPago(@CurrentUser() user: AuthUser) {
    return this.service.metodosPago(user);
  }

  @Post('suscripcion/contratar')
  @Roles('admin')
  contratar(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true })) body: ContratarPlanDto,
  ) {
    return this.service.contratar(TenantContext.requireFinca(), user, body);
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

  // ── Revisión de transferencias (solo correos en PAGOS_REVISORES) ──
  @Get('pagos/por-revisar')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  porRevisar(@CurrentUser() user: AuthUser) {
    return this.service.pagosPorRevisar(user);
  }

  @Post('pagos/:idpago/aprobar')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  aprobar(
    @CurrentUser() user: AuthUser,
    @Param('idpago', ParseIntPipe) idpago: number,
  ) {
    return this.service.revisarPago(user, idpago, true);
  }

  @Post('pagos/:idpago/rechazar')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  rechazar(
    @CurrentUser() user: AuthUser,
    @Param('idpago', ParseIntPipe) idpago: number,
  ) {
    return this.service.revisarPago(user, idpago, false);
  }
}
