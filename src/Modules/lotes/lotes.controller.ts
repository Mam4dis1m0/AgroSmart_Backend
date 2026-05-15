import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { LotesService } from './lotes.service';
import { CreateLoteDto, UpdateLoteDto } from '../../dto/lote.dto';

@Controller('lotes')
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Get() findAll() { return this.lotesService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.lotesService.findOne(+id); }
  @Post() create(@Body() body: CreateLoteDto) { return this.lotesService.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: UpdateLoteDto) { return this.lotesService.update(+id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.lotesService.remove(+id); }
}