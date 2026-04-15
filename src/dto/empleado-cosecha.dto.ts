import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateEmpleadoCosechaDto {
  @IsNumber() @IsOptional() cantidadcosechada?: number;
  @IsNumber() @IsOptional() valorunitario?: number;
  @IsNumber() @IsOptional() preciobruto?: number;
  @IsNumber() @IsOptional() deducciones?: number;
  @IsNumber() @IsOptional() precioneto?: number;
  @IsString() @IsOptional() fechatrabajo?: string;
  @IsString() @IsOptional() observaciones?: string;
  @IsNumber() @IsOptional() idempleado?: number;
}

export class UpdateEmpleadoCosechaDto extends CreateEmpleadoCosechaDto {}