import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateEmpleadoDto {
  @IsNumber() idusuario: number;
  @IsNumber() @IsOptional() montoporhora?: number;
  @IsNumber() @IsOptional() montoporjornal?: number;

  /** Cómo se le paga: por día, semana o mes. */
  @IsIn(['dia', 'semana', 'mes']) @IsOptional() tipopago?: string;
  /** Cuánto se le paga por cada día, semana o mes. */
  @IsNumber() @Min(0) @IsOptional() valorpago?: number;
}

export class UpdateEmpleadoDto extends CreateEmpleadoDto {}
