import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { CreateNotificacionDto } from '../../dto/notificacion.dto';
import { Roles, SinFinca } from '../../auth/auth.decorators';

// Las notificaciones también las lee el comprador del Marketplace (ofertas cercanas, CU-34),
// que no pertenece a ninguna finca → @SinFinca; el servicio filtra por destinatario.
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get() @Roles('admin', 'empleado', 'comprador') @SinFinca()
  findAll() { return this.notificacionesService.findAll(); }

  @Get('no-leidas') @Roles('admin', 'empleado', 'comprador') @SinFinca()
  findNoLeidas() { return this.notificacionesService.findNoLeidas(); }

  @Get(':id') @Roles('admin', 'empleado', 'comprador') @SinFinca()
  findOne(@Param('id') id: string) { return this.notificacionesService.findOne(+id); }

  @Post() @Roles('admin')
  create(@Body() body: CreateNotificacionDto) { return this.notificacionesService.create(body); }

  @Put(':id/leer') @Roles('admin', 'empleado', 'comprador') @SinFinca()
  marcarLeida(@Param('id') id: string) { return this.notificacionesService.marcarLeida(+id); }

  @Put('leer-todas') @Roles('admin', 'empleado', 'comprador') @SinFinca()
  marcarTodasLeidas() { return this.notificacionesService.marcarTodasLeidas(); }

  @Delete(':id') @Roles('admin')
  remove(@Param('id') id: string) { return this.notificacionesService.remove(+id); }
}
