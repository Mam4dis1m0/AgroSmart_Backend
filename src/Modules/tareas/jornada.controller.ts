import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Roles } from '../../auth/auth.decorators';
import { TenantContext } from '../../auth/tenant-context';
import { JornadaDto } from '../../dto/jornada.dto';
import { horasDeJornada, manoObraDeFinca } from './mano-obra';

/**
 * Jornada de un día normal de la finca y, con el pago de los empleados, el costo promedio por hora de
 * mano de obra con el que se costean las tareas.
 */
@Controller('api/v1/tareas/config/jornada')
export class JornadaController {
  constructor(private readonly ds: DataSource) {}

  @Get()
  @Roles('admin')
  obtener() {
    return manoObraDeFinca(
      (q, p) => this.ds.query(q, p),
      TenantContext.requireFinca(),
    );
  }

  @Put()
  @Roles('admin')
  async guardar(@Body() dto: JornadaDto) {
    if (
      horasDeJornada(dto.jornadainicio, dto.jornadafin, dto.jornadadescanso) <=
      0
    ) {
      throw new BadRequestException(
        'La salida debe ser posterior a la entrada y el descanso no puede ocupar toda la jornada',
      );
    }
    const idfinca = TenantContext.requireFinca();
    await this.ds.query(
      `UPDATE finca SET jornadainicio = $2, jornadafin = $3, jornadadescanso = $4, jornadapersonas = $5 WHERE idfinca = $1`,
      [
        idfinca,
        dto.jornadainicio,
        dto.jornadafin,
        dto.jornadadescanso,
        dto.jornadapersonas ?? null,
      ],
    );
    return manoObraDeFinca((q, p) => this.ds.query(q, p), idfinca);
  }
}
