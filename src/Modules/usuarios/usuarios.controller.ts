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
  update(@Param('id') id: string, @Body() body: any) { return this.usuariosService.update(+id, body); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.usuariosService.remove(+id); }

  @Post('register')
  registrar(@Body() body: any) { return this.usuariosService.registrar(body); }

  @Post('login')
  login(@Body() body: { email: string; contrasena: string }) {
    return this.usuariosService.login(body.email, body.contrasena);
  }
}