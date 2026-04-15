import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { AdministradorService } from './administrador.service';
import { Administrador } from '../Entidades/entities/Administrador';

@Controller('administrador')
export class AdministradorController {
  constructor(private readonly service: AdministradorService) {}

  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
  @Post() create(@Body() body: Partial<Administrador>) {
    return this.service.create(body);
  }
  @Put(':id') update(
    @Param('id') id: string,
    @Body() body: Partial<Administrador>,
  ) {
    return this.service.update(+id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
