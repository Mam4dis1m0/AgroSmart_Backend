import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateLoteDto {
  @IsString() @IsOptional() nombre?: string;
  @IsNumber() @IsOptional() areahectareas?: number;
  @IsString() @IsOptional() ubicacion?: string;
  @IsString() @IsOptional() descripcion?: string;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class UpdateLoteDto extends CreateLoteDto {}