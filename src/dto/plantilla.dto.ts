import { Type } from 'class-transformer';
import { ETAPAS } from '../Modules/plantillas/categorias';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class PlantillaInsumoDto {
  @IsOptional() @IsInt() @Min(1) idinsumo?: number;
  @IsOptional() @IsString() @MaxLength(100) tipoinsumo?: string;
  @IsOptional() @IsNumber() @Min(0) cantidadsugerida?: number;
  @IsOptional() @IsString() @MaxLength(30) unidad?: string;
}

export class CreatePlantillaDto {
  @IsString() categoria: string;
  @IsOptional() @IsString() @MaxLength(100) tipocultivo?: string;
  @IsString() @MaxLength(50) actividad: string;
  @IsOptional() @IsIn(ETAPAS as unknown as string[], { message: 'La etapa debe ser una de las opciones de la lista' }) etapa?: string;
  @IsOptional() @IsIn(['siembra', 'cosecha_estimada', 'inicio']) base?: string;
  @IsOptional() @IsInt() @Min(-365) @Max(3650) diasoffset?: number;
  @IsOptional() @IsBoolean() esrecurrente?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(365) frecuenciadias?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3650) diasfin?: number;
  @IsOptional() @IsNumber() @Min(0) horasestimadas?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(100) personasporhectarea?: number;
  @IsOptional() @IsIn(['Alta', 'Media', 'Baja']) prioridad?: string;
  @IsOptional() @IsIn(['tiempo', 'fijo']) modalidadpago?: string;
  @IsOptional() @IsBoolean() activa?: boolean;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlantillaInsumoDto)
  insumos?: PlantillaInsumoDto[];
}

export class UpdatePlantillaDto {
  @IsOptional() @IsString() categoria?: string;
  @IsOptional() @IsString() @MaxLength(100) tipocultivo?: string;
  @IsOptional() @IsString() @MaxLength(50) actividad?: string;
  @IsOptional() @IsIn(ETAPAS as unknown as string[], { message: 'La etapa debe ser una de las opciones de la lista' }) etapa?: string;
  @IsOptional() @IsIn(['siembra', 'cosecha_estimada', 'inicio']) base?: string;
  @IsOptional() @IsInt() @Min(-365) @Max(3650) diasoffset?: number;
  @IsOptional() @IsBoolean() esrecurrente?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(365) frecuenciadias?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3650) diasfin?: number;
  @IsOptional() @IsNumber() @Min(0) horasestimadas?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(100) personasporhectarea?: number;
  @IsOptional() @IsIn(['Alta', 'Media', 'Baja']) prioridad?: string;
  @IsOptional() @IsIn(['tiempo', 'fijo']) modalidadpago?: string;
  @IsOptional() @IsBoolean() activa?: boolean;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlantillaInsumoDto)
  insumos?: PlantillaInsumoDto[];
}

export class GenerarPlanDto {
  @IsOptional() @IsArray() @IsInt({ each: true })
  ids?: number[];
}
