import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateNotificacionDto {
  @IsString() @IsOptional() mensaje?: string;
  @IsString() @IsOptional() tipo?: string;
  @IsString() @IsOptional() tablaOrigen?: string;
  @IsNumber() @IsOptional() idregistro?: number;
  @IsBoolean() @IsOptional() leida?: boolean;
}

export class UpdateNotificacionDto extends CreateNotificacionDto {}