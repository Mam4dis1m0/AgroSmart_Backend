import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { EmpleadoCosechaService } from './empleado-cosecha.service';
import { EmpleadoCosecha } from '../Entidades/entities/EmpleadoCosecha';

@Controller('empleado-cosecha')
export class EmpleadoCosechaController {
  constructor(private readonly service: EmpleadoCosechaService) {}

  @Get() 
  findAll() { 
    return this.service.findAll(); 
  }

  @Get(':id') 
  findOne(@Param('id') id: string) { 
    return this.service.findOne(+id); 
  }

  @Post() 
  create(@Body() body: Partial<EmpleadoCosecha>) { 
    return this.service.create(body); 
  }

  @Put(':id') 
  update(@Param('id') id: string, @Body() body: Partial<EmpleadoCosecha>) { 
    return this.service.update(+id, body); 
  }

  @Delete(':id') 
  remove(@Param('id') id: string) { 
    return this.service.remove(+id); 
  }
}
