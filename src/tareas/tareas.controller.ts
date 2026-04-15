import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { TareasService } from './tareas.service';
import { Tarea } from '../Entidades/entities/Tarea';

@Controller('tareas')
export class TareasController {
  constructor(private readonly service: TareasService) {}

  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
  @Post() create(@Body() body: Partial<Tarea>) {
    return this.service.create(body);
  }
  @Put(':id') update(@Param('id') id: string, @Body() body: Partial<Tarea>) {
    return this.service.update(+id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
