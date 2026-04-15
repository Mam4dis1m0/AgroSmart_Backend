import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { InsumosService } from './insumos.service';
import { CreateInsumoDto, UpdateInsumoDto } from '../../dto/insumo.dto';

@Controller('insumos')
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  @Get() findAll() { return this.insumosService.findAll(); }
  @Get('stock-bajo') findStockBajo() { return this.insumosService.findStockBajo(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.insumosService.findOne(+id); }
  @Post() create(@Body() body: CreateInsumoDto) { return this.insumosService.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: UpdateInsumoDto) { return this.insumosService.update(+id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.insumosService.remove(+id); }
}