import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { EmpleadoCosechaService } from './empleado-cosecha.service';
import { EmpleadoCosecha } from '../Entidades/entities/EmpleadoCosecha';

@Controller('empleado-cosecha')
export class EmpleadoCosechaController {
  constructor(private readonly empleadoCosechaService: EmpleadoCosechaService) {}

  @Get()
  findAll() {
    return this.empleadoCosechaService.findAll();
  }

  @Get('empleado/:id')
  findByEmpleado(@Param('id') id: string) {
    return this.empleadoCosechaService.findByEmpleado(+id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.empleadoCosechaService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<EmpleadoCosecha>) {
    return this.empleadoCosechaService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<EmpleadoCosecha>) {
    return this.empleadoCosechaService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.empleadoCosechaService.remove(+id);
  }
}
