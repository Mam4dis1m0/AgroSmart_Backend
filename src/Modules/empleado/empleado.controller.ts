import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { EmpleadoService } from './empleado.service';
import { CreateEmpleadoDto, UpdateEmpleadoDto } from '../../dto/empleado.dto';

@Controller('empleados')
export class EmpleadoController {
  constructor(private readonly empleadoService: EmpleadoService) {}

  @Get() findAll() { return this.empleadoService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.empleadoService.findOne(+id); }
  @Post() create(@Body() body: CreateEmpleadoDto) { return this.empleadoService.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: UpdateEmpleadoDto) { return this.empleadoService.update(+id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.empleadoService.remove(+id); }
}