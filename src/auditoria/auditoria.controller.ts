import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { Auditoria } from '../Entidades/entities/Auditoria';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly service: AuditoriaService) {}

  @Get() 
  findAll() { 
    return this.service.findAll(); 
  }

  @Get(':id') 
  findOne(@Param('id') id: string) { 
    return this.service.findOne(+id); 
  }

  @Post() 
  create(@Body() body: Partial<Auditoria>) { 
    return this.service.create(body); 
  }

  @Put(':id') 
  update(@Param('id') id: string, @Body() body: Partial<Auditoria>) { 
    return this.service.update(+id, body); 
  }

  @Delete(':id') 
  remove(@Param('id') id: string) { 
    return this.service.remove(+id); 
  }
}
