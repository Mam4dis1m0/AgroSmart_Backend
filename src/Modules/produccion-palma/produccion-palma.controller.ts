import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { ProduccionPalmaService } from './produccion-palma.service';
import { CreateProduccionPalmaDto, UpdateProduccionPalmaDto } from '../../dto/produccion-palma.dto';
import { Roles } from '../../auth/auth.decorators';

@Controller('produccion-palma')
export class ProduccionPalmaController {
  constructor(private readonly produccionPalmaService: ProduccionPalmaService) {}

  @Get() findAll() { return this.produccionPalmaService.findAll(); }
  @Get('lote/:idlote') findByLote(@Param('idlote') idlote: string) { return this.produccionPalmaService.findByLote(+idlote); }
  @Get('palma/:idpalma') findByPalma(@Param('idpalma') idpalma: string) { return this.produccionPalmaService.findByPalma(+idpalma); }
  @Get(':id') findOne(@Param('id') id: string) { return this.produccionPalmaService.findOne(+id); }
  @Post() @Roles('admin') create(@Body() body: CreateProduccionPalmaDto) { return this.produccionPalmaService.create(body); }
  @Put(':id') @Roles('admin') update(@Param('id') id: string, @Body() body: UpdateProduccionPalmaDto) { return this.produccionPalmaService.update(+id, body); }
  @Delete(':id') @Roles('admin') remove(@Param('id') id: string) { return this.produccionPalmaService.remove(+id); }
}
