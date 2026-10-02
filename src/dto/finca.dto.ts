import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// CU-35 · Registrar Finca (Tenant)
export class CreateFincaDto {
  @IsString() @IsNotEmpty() @MaxLength(150)
  nombre: string;

  @IsString() @IsOptional() @MaxLength(255)
  ubicacion?: string;

  @IsNumber() @Min(-90) @Max(90) @IsOptional()
  latitud?: number;

  @IsNumber() @Min(-180) @Max(180) @IsOptional()
  longitud?: number;

  /** Ej.: café, arroz, maíz */
  @IsString() @IsOptional() @MaxLength(100)
  tipoproduccion?: string;
}

export class UpdateFincaDto extends PartialType(CreateFincaDto) {}

// Activar / desactivar a un miembro de la finca (RNF-11)
export class CambiarEstadoMiembroDto {
  @IsBoolean()
  activo: boolean;
}
