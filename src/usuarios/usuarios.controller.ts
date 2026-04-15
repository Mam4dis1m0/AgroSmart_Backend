import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { Usuario } from '../Entidades/entities/Usuario';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<Usuario>) {
    return this.usuariosService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Usuario>) {
    return this.usuariosService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usuariosService.remove(+id);
  }
}