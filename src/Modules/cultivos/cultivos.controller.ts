import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { CultivosService } from './cultivos.service';
import { CreateCultivoDto, UpdateCultivoDto } from '../../dto/cultivo.dto';
import { Roles } from '../../auth/auth.decorators';

@Controller('cultivos')
export class CultivosController {
  constructor(private readonly cultivosService: CultivosService) {}

  @Get() findAll() {
    return this.cultivosService.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.cultivosService.findOne(+id);
  }
  @Post() @Roles('admin') create(@Body() body: CreateCultivoDto) {
    return this.cultivosService.create(body);
  }
  @Put(':id') @Roles('admin') update(@Param('id') id: string, @Body() body: UpdateCultivoDto) {
    return this.cultivosService.update(+id, body);
  }
  @Delete(':id') @Roles('admin') remove(@Param('id') id: string) {
    return this.cultivosService.remove(+id);
  }
}
