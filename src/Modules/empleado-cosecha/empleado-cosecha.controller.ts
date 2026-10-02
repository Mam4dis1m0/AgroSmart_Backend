import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { EmpleadoCosechaService } from './empleado-cosecha.service';
import { CreateEmpleadoCosechaDto, UpdateEmpleadoCosechaDto } from '../../dto/empleado-cosecha.dto';
import { Roles } from '../../auth/auth.decorators';

@Controller('empleado-cosecha')
export class EmpleadoCosechaController {
  constructor(private readonly empleadoCosechaService: EmpleadoCosechaService) {}

  @Get() findAll() { return this.empleadoCosechaService.findAll(); }
  @Get('empleado/:id') findByEmpleado(@Param('id') id: string) { return this.empleadoCosechaService.findByEmpleado(+id); }
  @Get(':id') findOne(@Param('id') id: string) { return this.empleadoCosechaService.findOne(+id); }
  @Post() @Roles('admin') create(@Body() body: CreateEmpleadoCosechaDto) { return this.empleadoCosechaService.create(body); }
  @Put(':id') @Roles('admin') update(@Param('id') id: string, @Body() body: UpdateEmpleadoCosechaDto) { return this.empleadoCosechaService.update(+id, body); }
  @Delete(':id') @Roles('admin') remove(@Param('id') id: string) { return this.empleadoCosechaService.remove(+id); }
}
