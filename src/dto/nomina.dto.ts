import { IsDateString, IsIn, IsNumber, IsOptional, Min } from 'class-validator';

// CU-38 · período de la nómina (YYYY-MM-DD)
export class CreateNominaDto {
  @IsDateString() fechainicio: string;
  @IsDateString() fechafin: string;
}

export class AjustarDeduccionesDto {
  @IsNumber() @Min(0) deducciones: number;
}

// CU-39 / CU-40 · filtros de reportes
export class RangoFechasDto {
  @IsDateString() @IsOptional() desde?: string;
  @IsDateString() @IsOptional() hasta?: string;
}

export class ExportarDto extends RangoFechasDto {
  @IsIn(['gastos', 'insumos', 'cultivo']) tipo: 'gastos' | 'insumos' | 'cultivo';
}
