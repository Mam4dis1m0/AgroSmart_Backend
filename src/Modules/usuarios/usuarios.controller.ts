import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CurrentUser, Public, Roles, SinFinca } from '../../auth/auth.decorators';
import { AuthUser } from '../../auth/tenant-context';
import {
  CambiarPasswordDto,
  FotoPerfilDto,
  ForgotPasswordDto,
  LoginDto,
  LoginGoogleDto,
  RegistrarEmpleadoDto,
  RegistrarUsuarioDto,
  ResetPasswordDto,
  UbicacionCompradorDto,
  UpdateUsuarioDto,
} from '../../dto/Usuario.dto';

@Controller('usuarios')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  // ── Rutas públicas (sin token) ────────────────────────────────────────────
  @Public()
  @Post('register')
  registrar(@Body() dto: RegistrarUsuarioDto) {
    return this.usuariosService.registrar(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.usuariosService.login(dto.email, dto.contrasena);
  }

  @Public()
  @Post('login-google')
  loginGoogle(@Body() dto: LoginGoogleDto) {
    return this.usuariosService.loginGoogle(dto.credential);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.usuariosService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.usuariosService.resetPassword(dto.token, dto.nuevaContrasena);
  }

  // ── Cualquier usuario autenticado (no requiere finca activa) ──────────────
  @Get('me')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  me() {
    return this.usuariosService.me();
  }

  @Put(':id/password')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  cambiarPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarPasswordDto) {
    return this.usuariosService.cambiarPassword(id, dto.contrasenaActual, dto.contrasenaNueva);
  }

  @Put(':id/foto-perfil')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  actualizarFotoPerfil(@Param('id', ParseIntPipe) id: number, @Body() dto: FotoPerfilDto) {
    return this.usuariosService.actualizarFotoPerfil(id, dto.imagen);
  }

  // ── Comprador externo (Marketplace) ───────────────────────────────────────
  @Get('comprador/perfil')
  @Roles('comprador')
  @SinFinca()
  perfilComprador(@CurrentUser() user: AuthUser) {
    return this.usuariosService.perfilComprador(user.idusuario);
  }

  @Put('comprador/ubicacion')
  @Roles('comprador')
  @SinFinca()
  ubicacionComprador(@CurrentUser() user: AuthUser, @Body() dto: UbicacionCompradorDto) {
    return this.usuariosService.actualizarUbicacionComprador(user.idusuario, dto);
  }

  // ── Gestión de personal de la finca activa ────────────────────────────────
  // CU-01 · el administrador da de alta a un empleado en SU finca
  @Post('empleados')
  @Roles('admin')
  registrarEmpleado(@Body() dto: RegistrarEmpleadoDto, @CurrentUser() user: AuthUser) {
    return this.usuariosService.registrarEmpleado(dto, user);
  }

  @Get()
  @Roles('admin')
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUsuarioDto) {
    return this.usuariosService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.remove(id);
  }
}
