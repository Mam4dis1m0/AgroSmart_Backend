import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateTareaDto {
  @IsString() @IsOptional() tipoactividad?: string;
  @IsString() @IsOptional() fechaprogramada?: string;
  @IsNumber() @IsOptional() tiempototaltarea?: number;
  @IsString() @IsOptional() estado?: string;
  @IsString() @IsOptional() esrecurrente?: string;
  @IsNumber() @IsOptional() frecuenciadias?: number;
  @IsNumber() @IsOptional() costototal?: number;
  @IsNumber() @IsOptional() costotransporte?: number;
  @IsNumber() @IsOptional() idadmincreador?: number;
  @IsNumber() @IsOptional() idcultivo?: number;
}

export class UpdateTareaDto extends CreateTareaDto {}