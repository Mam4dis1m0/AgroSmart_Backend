import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { CreateAuditoriaDto } from '../../dto/auditoria.dto';
import { Roles } from '../../auth/auth.decorators';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  // El historial lo consulta el administrador; cualquier miembro puede registrar una acción
  @Get() @Roles('admin') findAll() {
    return this.auditoriaService.findAll();
  }
  @Get('tabla/:tabla') @Roles('admin') findByTabla(@Param('tabla') tabla: string) {
    return this.auditoriaService.findByTabla(tabla);
  }
  @Get(':id') @Roles('admin') findOne(@Param('id') id: string) {
    return this.auditoriaService.findOne(+id);
  }
  @Post() create(@Body() body: CreateAuditoriaDto) {
    return this.auditoriaService.create(body);
  }
  @Delete(':id') @Roles('admin') remove(@Param('id') id: string) {
    return this.auditoriaService.remove(+id);
  }
}
