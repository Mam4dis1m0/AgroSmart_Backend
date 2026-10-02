import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe,
  UsePipes, ValidationPipe,
} from '@nestjs/common';
import { InsumosService } from './insumos.service';
import { CreateCompraInsumoDto, CreateInsumoDto, UpdateInsumoDto } from '../../dto/insumo.dto';
import { Roles } from '../../auth/auth.decorators';

@Controller('api/v1/insumos')
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  @Get() findAll() { return this.insumosService.findAll(); }
  @Get('stock-bajo') findStockBajo() { return this.insumosService.findStockBajo(); }

  // CU-15 · historial de compras (todas, o filtradas por ?idinsumo=)
  @Get('compras') @Roles('admin')
  listarCompras(@Query('idinsumo') idinsumo?: string) {
    return this.insumosService.listarCompras(idinsumo ? +idinsumo : undefined);
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.insumosService.findOne(+id); }
  @Post() @Roles('admin') create(@Body() body: CreateInsumoDto) { return this.insumosService.create(body); }
  @Put(':id') @Roles('admin') update(@Param('id') id: string, @Body() body: UpdateInsumoDto) { return this.insumosService.update(+id, body); }
  @Delete(':id') @Roles('admin') remove(@Param('id') id: string) { return this.insumosService.remove(+id); }

  // CU-15 · registrar compra: suma el stock automáticamente
  @Post(':id/compras') @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  registrarCompra(@Param('id', ParseIntPipe) id: number, @Body() body: CreateCompraInsumoDto) {
    return this.insumosService.registrarCompra(id, body);
  }
}
