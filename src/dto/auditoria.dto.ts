import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateAuditoriaDto {
  @IsString() @IsOptional() tablaNombre?: string;
  @IsString() @IsOptional() operacion?: string;
  @IsNumber() @IsOptional() idregistro?: number;
  @IsString() @IsOptional() descripcion?: string;
}