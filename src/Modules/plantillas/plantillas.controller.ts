import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/auth.decorators';
import { TenantContext } from '../../auth/tenant-context';
import {
  CreatePlantillaDto,
  GenerarPlanDto,
  UpdatePlantillaDto,
} from '../../dto/plantilla.dto';
import { PlantillasService } from './plantillas.service';
import { RecurrenciaService } from './recurrencia.service';

@Controller('api/v1/plantillas')
export class PlantillasController {
  constructor(
    private readonly service: PlantillasService,
    private readonly recurrencia: RecurrenciaService,
  ) {}

  @Get('categorias')
  categorias() {
    return this.service.categorias();
  }

  @Get('catalogo')
  catalogo(@Query('categoria') categoria?: string) {
    return this.service.catalogo(categoria);
  }

  /** Vista previa del plan de labores de un cultivo (no crea nada). */
  @Get('plan/:idcultivo')
  @Roles('admin')
  vistaPrevia(@Param('idcultivo', ParseIntPipe) idcultivo: number) {
    return this.service.vistaPrevia(idcultivo);
  }

  /** Crea las tareas elegidas del plan de labores. */
  @Post('plan/:idcultivo')
  @Roles('admin')
  generar(
    @Param('idcultivo', ParseIntPipe) idcultivo: number,
    @Body() dto: GenerarPlanDto,
  ) {
    return this.service.generarPlan(idcultivo, dto?.ids);
  }

  /** Programa ahora las siguientes ocurrencias de las tareas recurrentes de esta finca. */
  @Post('recurrencias/procesar')
  @Roles('admin')
  async procesar() {
    return {
      creadas: await this.recurrencia.procesar(TenantContext.requireFinca()),
    };
  }

  @Post('adoptar')
  @Roles('admin')
  adoptar(@Body('categoria') categoria: string) {
    return this.service.adoptar(categoria);
  }

  @Get()
  @Roles('admin')
  listar(@Query('categoria') categoria?: string) {
    return this.service.listar(categoria);
  }

  @Post()
  @Roles('admin')
  crear(@Body() dto: CreatePlantillaDto) {
    return this.service.crear(dto);
  }

  @Put(':id')
  @Roles('admin')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlantillaDto,
  ) {
    return this.service.actualizar(id, dto);
  }
}
