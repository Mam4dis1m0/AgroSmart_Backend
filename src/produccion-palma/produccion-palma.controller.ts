import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { ProduccionPalmaService } from './produccion-palma.service';
import { ProduccionPalma } from '../Entidades/entities/ProduccionPalma';

@Controller('produccion-palma')
export class ProduccionPalmaController {
  constructor(private readonly produccionPalmaService: ProduccionPalmaService) {}

  @Get()
  findAll() {
    return this.produccionPalmaService.findAll();
  }

  @Get('lote/:idlote')
  findByLote(@Param('idlote') idlote: string) {
    return this.produccionPalmaService.findByLote(+idlote);
  }

  @Get('palma/:idpalma')
  findByPalma(@Param('idpalma') idpalma: string) {
    return this.produccionPalmaService.findByPalma(+idpalma);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.produccionPalmaService.findOne(+id);
  }

  @Post()
  create(@Body() body: Partial<ProduccionPalma>) {
    return this.produccionPalmaService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<ProduccionPalma>) {
    return this.produccionPalmaService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.produccionPalmaService.remove(+id);
  }
}
