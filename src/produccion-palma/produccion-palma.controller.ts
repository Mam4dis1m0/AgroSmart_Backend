import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ProduccionPalmaService } from './produccion-palma.service';
import { ProduccionPalma } from '../Entidades/entities/ProduccionPalma';

@Controller('produccion-palma')
export class ProduccionPalmaController {
  constructor(private readonly service: ProduccionPalmaService) {}

  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
  @Post() create(@Body() body: Partial<ProduccionPalma>) {
    return this.service.create(body);
  }
  @Put(':id') update(
    @Param('id') id: string,
    @Body() body: Partial<ProduccionPalma>,
  ) {
    return this.service.update(+id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
