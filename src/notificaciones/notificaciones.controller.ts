import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { Notificacion } from '../Entidades/entities/Notificacion';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  findAll() {
    return this.notificacionesService.findAll();
  }

  @Get('no-leidas')
  findNoLeidas() {
    return this.notificacionesService.findNoLeidas();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificacionesService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<Notificacion>) {
    return this.notificacionesService.create(body);
  }

  @Put(':id/leer')
  marcarLeida(@Param('id') id: string) {
    return this.notificacionesService.marcarLeida(+id);
  }

  @Put('leer-todas')
  marcarTodasLeidas() {
    return this.notificacionesService.marcarTodasLeidas();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notificacionesService.remove(+id);
  }
}
