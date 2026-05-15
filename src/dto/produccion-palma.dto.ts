import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateProduccionPalmaDto {
  @IsString() @IsOptional() fecharegistro?: string;
  @IsNumber() @IsOptional() cantidadracimos?: number;
  @IsNumber() @IsOptional() pesokg?: number;
  @IsString() @IsOptional() calidad?: string;
  @IsString() @IsOptional() observaciones?: string;
  @IsNumber() @IsOptional() idlote?: number;
  @IsNumber() @IsOptional() idpalma?: number;
}

export class UpdateProduccionPalmaDto extends CreateProduccionPalmaDto {}