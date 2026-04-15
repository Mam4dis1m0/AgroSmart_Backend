import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { PalmasService } from './palmas.service';
import { Palma } from '../Entidades/entities/Palma';

@Controller('palmas')
export class PalmasController {
  constructor(private readonly service: PalmasService) {}

  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
  @Post() create(@Body() body: Partial<Palma>) {
    return this.service.create(body);
  }
  @Put(':id') update(@Param('id') id: string, @Body() body: Partial<Palma>) {
    return this.service.update(+id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
