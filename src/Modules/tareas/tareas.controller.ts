import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, BadRequestException,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { TareasService } from './tareas.service';
import { CreateTareaDto, UpdateTareaDto, AsignarTareaDto } from '../../dto/tarea.dto';

@Controller('api/v1/tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Get()
  findAll() { return this.tareasService.findAll(); }

  @Get('estado/:estado')
  findByEstado(@Param('estado') estado: string) {
    return this.tareasService.findByEstado(estado);
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.tareasService.findOne(+id); }

  @Post()
  create(@Body() body: CreateTareaDto) { return this.tareasService.create(body); }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateTareaDto) {
    return this.tareasService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const idNum = parseInt(id, 10);
    if (isNaN(idNum)) throw new BadRequestException('ID inválido');
    return this.tareasService.remove(idNum);
  }

  @Patch(':id/asignar')
  asignar(@Param('id') id: string, @Body() dto: AsignarTareaDto) {
    return this.tareasService.asignar(+id, dto);
  }

  @Patch(':id/completar')
  completar(@Param('id') id: string) {
    return this.tareasService.completar(+id);
  }

  // ── NUEVO ─────────────────────────────────────────────────────────────────
  @Post(':id/completar-con-evidencia')
  @UseInterceptors(FileInterceptor('evidencia', {
    storage: diskStorage({
      destination: './uploads/evidencias',
      filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
    }),
  }))
  completarConEvidencia(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file?: any,
  ) {
    return this.tareasService.completarConEvidencia(+id, body, file?.path ?? null);
  }
}