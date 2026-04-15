import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { PalmasService } from './palmas.service';
import { Palma } from '../Entidades/entities/Palma';

@Controller('palmas')
export class PalmasController {
  constructor(private readonly palmasService: PalmasService) {}

  @Get()
  findAll() {
    return this.palmasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.palmasService.findOne(+id);
  }

  @Get('lote/:idlote')
  findByLote(@Param('idlote') idlote: string) {
    return this.palmasService.findByLote(+idlote);
  }

  @Post()
  create(@Body() body: Partial<Palma>) {
    return this.palmasService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Palma>) {
    return this.palmasService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.palmasService.remove(+id);
  }
}
