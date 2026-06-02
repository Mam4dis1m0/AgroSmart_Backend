import { IsString, IsNumber, IsOptional, IsEmail } from 'class-validator';

export class CreateInsumoDto {
  @IsString()  @IsOptional() nombre?: string;
  @IsString()  @IsOptional() tipo?: string;
  @IsNumber()  @IsOptional() stockactual?: number;
  @IsNumber()  @IsOptional() stockminimo?: number;
  @IsNumber()  @IsOptional() costounitario?: number;
  @IsString()  @IsOptional() unidadmedida?: string;
  @IsString()  @IsOptional() fechaultimaactualizacion?: string;
  @IsNumber()  @IsOptional() idadminregistro?: number;
}

export class UpdateInsumoDto extends CreateInsumoDto {
  // El frontend manda el email del admin que está logueado
  // para que el correo de stock bajo llegue a la persona correcta
  @IsEmail()   @IsOptional() emailAdminLogueado?: string;
}