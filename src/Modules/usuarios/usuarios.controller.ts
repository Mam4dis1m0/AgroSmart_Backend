import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  findAll() { return this.usuariosService.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.usuariosService.findOne(+id); }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.usuariosService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.usuariosService.remove(+id); }

  @Post('register')
  registrar(@Body() body: any) { return this.usuariosService.registrar(body); }

  @Post('login')
  login(@Body() body: { email: string; contrasena: string }) {
    return this.usuariosService.login(body.email, body.contrasena);
  }

  @Put(':id/password')
  cambiarPassword(
    @Param('id') id: string,
    @Body() body: { contrasenaActual: string; contrasenaNueva: string },
  ) {
    return this.usuariosService.cambiarPassword(
      +id,
      body.contrasenaActual,
      body.contrasenaNueva,
    );
  }
  
// Solicitar recuperación
@Post('forgot-password')
forgotPassword(@Body() body: { email: string }) {
  return this.usuariosService.forgotPassword(body.email);
}

// Restablecer con token
@Post('reset-password')
resetPassword(@Body() body: { token: string; nuevaContrasena: string }) {
  return this.usuariosService.resetPassword(body.token, body.nuevaContrasena);
}


  @Post('login-google')
  loginGoogle(@Body() body: { email: string; picture?: string }) {
    return this.usuariosService.loginGoogle(body.email, body.picture);
  }

  // ── FIX #1: nuevo endpoint para subir/actualizar foto de perfil ───────────
  // El frontend envía la imagen como base64: { imagen: "data:image/jpeg;base64,..." }
  // La URL resultante (Cloudinary) es pública y se ve desde cualquier PC.
  @Put(':id/foto-perfil')
  actualizarFotoPerfil(
    @Param('id') id: string,
    @Body() body: { imagen: string },
  ) {
    return this.usuariosService.actualizarFotoPerfil(+id, body.imagen);
  }
}