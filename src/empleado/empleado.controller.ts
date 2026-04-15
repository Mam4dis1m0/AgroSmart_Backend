import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { EmpleadoService } from './empleado.service';
import { Empleado } from '../Entidades/entities/Empleado';

@Controller('empleado')
export class EmpleadoController {
  constructor(private readonly service: EmpleadoService) {}

  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
  @Post() create(@Body() body: Partial<Empleado>) {
    return this.service.create(body);
  }
  @Put(':id') update(@Param('id') id: string, @Body() body: Partial<Empleado>) {
    return this.service.update(+id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
