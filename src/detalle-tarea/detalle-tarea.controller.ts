import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { DetalleTareaService } from './detalle-tarea.service';
import { DetalleTarea } from '../Entidades/entities/DetalleTarea';

@Controller('detalle-tarea')
export class DetalleTareaController {
  constructor(private readonly detalleTareaService: DetalleTareaService) {}

  @Get()
  findAll() {
    return this.detalleTareaService.findAll();
  }

  @Get('tarea/:idtarea')
  findByTarea(@Param('idtarea') idtarea: string) {
    return this.detalleTareaService.findByTarea(+idtarea);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.detalleTareaService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<DetalleTarea>) {
    return this.detalleTareaService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<DetalleTarea>) {
    return this.detalleTareaService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.detalleTareaService.remove(+id);
  }
}
