import { Controller, Get, Query, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Response } from 'express';
import { RequiereFuncion, Roles } from '../../auth/auth.decorators';
import { TenantContext } from '../../auth/tenant-context';
import { ExportarDto, RangoFechasDto } from '../../dto/nomina.dto';
import { ReportesService } from './reportes.service';

@Controller('api/v1/reportes')
@Roles('admin')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  // CU-39 · Control de insumos por pagos (Premium)
  @Get('costos')
  @RequiereFuncion('control_insumos_pagos')
  costos(@Query() q: RangoFechasDto) {
    return this.service.costosPorCultivo(TenantContext.requireFinca(), q.desde, q.hasta);
  }

  // CU-40 · Exportar Gastos / Insumos / Cultivo a Excel (Premium)
  @Get('exportar')
  @RequiereFuncion('exportar_excel')
  async exportar(@Query() q: ExportarDto, @Res() res: Response) {
    const { nombre, csv } = await this.service.exportar(TenantContext.requireFinca(), q.tipo, q.desde, q.hasta);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    });
    res.send(csv);
  }
}
