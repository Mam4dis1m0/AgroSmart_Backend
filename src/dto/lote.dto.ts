import { IsString, IsNumber, IsBoolean, IsOptional, Matches, MaxLength } from 'class-validator';

export class CreateLoteDto {
  @IsString() @IsOptional() nombre?: string;
  @IsNumber() @IsOptional() areahectareas?: number;
  @IsString() @IsOptional() ubicacion?: string;
  @IsString() @IsOptional() descripcion?: string;
  @IsString() @MaxLength(2048) @IsOptional() imagenurl?: string;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class UpdateLoteDto extends CreateLoteDto {}

export class FotoLoteDto {
  @IsString()
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'La imagen debe ser PNG, JPG o WEBP en base64',
  })
  imagen: string;
}