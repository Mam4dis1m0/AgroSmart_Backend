import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/auth.decorators';
import { CreateCosechaDto, UpdateCosechaDto } from '../../dto/cosecha.dto';
import { CosechasService } from './cosechas.service';

@Controller('api/v1/cosechas')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class CosechasController {
  constructor(private readonly service: CosechasService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get('cultivo/:idcultivo')
  findByCultivo(@Param('idcultivo', ParseIntPipe) idcultivo: number) {
    return this.service.findByCultivo(idcultivo);
  }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post() @Roles('admin')
  create(@Body() dto: CreateCosechaDto) { return this.service.create(dto); }

  @Put(':id') @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCosechaDto) { return this.service.update(id, dto); }

  @Delete(':id') @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
