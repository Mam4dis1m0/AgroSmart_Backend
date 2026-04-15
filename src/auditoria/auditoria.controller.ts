import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { Auditoria } from '../Entidades/entities/Auditoria';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  findAll() {
    return this.auditoriaService.findAll();
  }

  @Get('tabla/:tabla')
  findByTabla(@Param('tabla') tabla: string) {
    return this.auditoriaService.findByTabla(tabla);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auditoriaService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<Auditoria>) {
    return this.auditoriaService.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.auditoriaService.remove(+id);
  }
}
