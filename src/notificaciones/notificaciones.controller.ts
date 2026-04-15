import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { Notificacion } from '../Entidades/entities/Notificacion';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  @Get() 
  findAll() { 
    return this.service.findAll(); 
  }

  @Get(':id') 
  findOne(@Param('id') id: string) { 
    return this.service.findOne(+id); 
  }

  @Post() 
  create(@Body() body: Partial<Notificacion>) { 
    return this.service.create(body); 
  }

  @Put(':id') 
  update(@Param('id') id: string, @Body() body: Partial<Notificacion>) { 
    return this.service.update(+id, body); 
  }

  @Delete(':id') 
  remove(@Param('id') id: string) { 
    return this.service.remove(+id); 
  }
}
