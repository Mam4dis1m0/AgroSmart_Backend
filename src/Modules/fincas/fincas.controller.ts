import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser, Roles, SinFinca } from '../../auth/auth.decorators';
import { AuthUser, TenantContext } from '../../auth/tenant-context';
import { CambiarEstadoMiembroDto, CreateFincaDto, UpdateFincaDto } from '../../dto/finca.dto';
import { FincasService } from './fincas.service';

@Controller('api/v1/fincas')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class FincasController {
  constructor(private readonly fincasService: FincasService) {}

  // CU-36 · selector de finca
  @Get('mis-fincas')
  @Roles('admin', 'empleado')
  @SinFinca()
  misFincas(@CurrentUser() user: AuthUser) {
    return this.fincasService.listarDeUsuario(user.idusuario);
  }

  // CU-37 · Dashboard Central
  @Get('dashboard')
  @Roles('admin')
  @SinFinca()
  dashboard(@CurrentUser() user: AuthUser) {
    return this.fincasService.dashboard(user);
  }

  // CU-35 · registrar finca (queda como finca activa en el token devuelto)
  @Post()
  @Roles('admin')
  @SinFinca()
  registrar(@Body() dto: CreateFincaDto, @CurrentUser() user: AuthUser) {
    return this.fincasService.registrar(dto, user);
  }

  // CU-36 · cambiar de finca → devuelve un JWT nuevo con la finca elegida
  @Post(':idfinca/seleccionar')
  @Roles('admin', 'empleado')
  @SinFinca()
  seleccionar(@Param('idfinca', ParseIntPipe) idfinca: number, @CurrentUser() user: AuthUser) {
    return this.fincasService.seleccionar(idfinca, user);
  }

  // ── Finca activa (la del token) ───────────────────────────────────────────
  @Get('activa')
  activa() {
    return this.fincasService.detalle(TenantContext.requireFinca());
  }

  @Put('activa')
  @Roles('admin')
  actualizar(@Body() dto: UpdateFincaDto) {
    return this.fincasService.actualizar(TenantContext.requireFinca(), dto);
  }

  @Get('activa/miembros')
  @Roles('admin')
  miembros() {
    return this.fincasService.listarMiembros(TenantContext.requireFinca());
  }

  @Patch('activa/miembros/:idusuario')
  @Roles('admin')
  async cambiarEstado(
    @Param('idusuario', ParseIntPipe) idusuario: number,
    @Body() dto: CambiarEstadoMiembroDto,
  ) {
    await this.fincasService.cambiarEstadoMiembro(TenantContext.requireFinca(), idusuario, dto.activo);
    return { message: dto.activo ? 'Miembro reactivado' : 'Miembro desactivado' };
  }

  @Delete('activa/miembros/:idusuario')
  @Roles('admin')
  async quitar(@Param('idusuario', ParseIntPipe) idusuario: number) {
    await this.fincasService.quitarMiembro(TenantContext.requireFinca(), idusuario);
    return { message: 'Miembro removido de la finca' };
  }
}
