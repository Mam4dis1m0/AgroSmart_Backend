import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { AdministradorService } from './administrador.service';
import { CreateAdministradorDto, UpdateAdministradorDto } from '../../dto/administrador.dto';

@Controller('administrador')
export class AdministradorController {
  constructor(private readonly service: AdministradorService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(+id); }
  @Post() create(@Body() body: CreateAdministradorDto) { return this.service.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: UpdateAdministradorDto) { return this.service.update(+id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(+id); }
}