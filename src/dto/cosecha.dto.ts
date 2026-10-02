import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// CU-16 · Registrar cosecha
export class CreateCosechaDto {
  @IsInt() idcultivo: number;
  @IsDateString() fechacosecha: string;      // YYYY-MM-DD
  @IsNumber() @Min(0) cantidad: number;
  @IsString() @IsOptional() @MaxLength(20) unidad?: string;   // por defecto kg
  @IsString() @IsOptional() @MaxLength(50) calidad?: string;
  @IsString() @IsOptional() observaciones?: string;
}

export class UpdateCosechaDto {
  @IsDateString() @IsOptional() fechacosecha?: string;
  @IsNumber() @Min(0) @IsOptional() cantidad?: number;
  @IsString() @IsOptional() @MaxLength(20) unidad?: string;
  @IsString() @IsOptional() @MaxLength(50) calidad?: string;
  @IsString() @IsOptional() observaciones?: string;
}
