import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateInsumoDto {
  @IsString() @IsOptional() nombre?: string;
  @IsString() @IsOptional() tipo?: string;
  @IsNumber() @IsOptional() stockactual?: number;
  @IsNumber() @IsOptional() stockminimo?: number;
  @IsNumber() @IsOptional() costounitario?: number;
  @IsString() @IsOptional() unidadmedida?: string;
  @IsString() @IsOptional() fechaultimaactualizacion?: string;
  @IsNumber() @IsOptional() idadminregistro?: number;
}

export class UpdateInsumoDto extends CreateInsumoDto {}