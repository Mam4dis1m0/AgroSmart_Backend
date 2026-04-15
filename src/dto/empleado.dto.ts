import { IsNumber, IsOptional } from 'class-validator';

export class CreateEmpleadoDto {
  @IsNumber() idusuario: number;
  @IsNumber() @IsOptional() montoporhora?: number;
  @IsNumber() @IsOptional() montoporjornal?: number;
}

export class UpdateEmpleadoDto extends CreateEmpleadoDto {}