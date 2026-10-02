import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser, RequiereFuncion, Roles } from '../../auth/auth.decorators';
import { AuthUser, TenantContext } from '../../auth/tenant-context';
import { AjustarDeduccionesDto, CreateNominaDto } from '../../dto/nomina.dto';
import { NominaService } from './nomina.service';

// Nómina y control de pagos: función Premium (RF-37). El PlanGuard devuelve 403 PLAN_PREMIUM_REQUERIDO.
@Controller('api/v1/nomina')
@Roles('admin')
@RequiereFuncion('nomina')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class NominaController {
  constructor(private readonly service: NominaService) {}

  @Get()
  listar() {
    return this.service.listar(TenantContext.requireFinca());
  }

  @Post()
  crear(@Body() dto: CreateNominaDto, @CurrentUser() user: AuthUser) {
    return this.service.crear(dto.fechainicio, dto.fechafin, user.idusuario, TenantContext.requireFinca());
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id, TenantContext.requireFinca());
  }

  @Patch('detalle/:iddetalle/deducciones')
  ajustar(@Param('iddetalle', ParseIntPipe) iddetalle: number, @Body() dto: AjustarDeduccionesDto) {
    return this.service.ajustarDeducciones(iddetalle, dto.deducciones, TenantContext.requireFinca());
  }

  @Patch(':id/confirmar')
  confirmar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.confirmar(id, TenantContext.requireFinca(), user.idusuario);
  }

  @Patch(':id/pagar')
  pagar(@Param('id', ParseIntPipe) id: number) {
    return this.service.pagar(id, TenantContext.requireFinca());
  }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.service.eliminar(id, TenantContext.requireFinca());
  }
}
