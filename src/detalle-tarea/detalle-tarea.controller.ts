import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { DetalleTareaService } from './detalle-tarea.service';
import { DetalleTarea } from '../Entidades/entities/DetalleTarea';

@Controller('detalle-tarea')
export class DetalleTareaController {
  constructor(private readonly service: DetalleTareaService) {}

  @Get() 
  findAll() { 
    return this.service.findAll(); 
  }

  @Get(':id') 
  findOne(@Param('id') id: string) { 
    return this.service.findOne(+id); 
  }

  @Post() 
  create(@Body() body: Partial<DetalleTarea>) { 
    return this.service.create(body); 
  }

  @Put(':id') 
  update(@Param('id') id: string, @Body() body: Partial<DetalleTarea>) { 
    return this.service.update(+id, body); 
  }

  @Delete(':id') 
  remove(@Param('id') id: string) { 
    return this.service.remove(+id); 
  }
}
