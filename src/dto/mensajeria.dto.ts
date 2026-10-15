import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';

/** Abrir (o recuperar) la conversación con el vendedor de una oferta. */
export class CrearHiloDto {
  @Type(() => Number) @IsInt() @IsPositive() idlistado: number;

  /** Opcional: vincula la conversación a una orden del comprador sobre esa oferta. */
  @Type(() => Number) @IsInt() @IsPositive() @IsOptional() idorden?: number;
}

export class EnviarMensajeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @IsNotEmpty({ message: 'El mensaje no puede estar vacío' }) @MaxLength(2000)
  contenido: string;
}

/**
 * Paginación por id (no por página): estable aunque lleguen mensajes nuevos.
 *  · sin parámetros → los últimos `limite`
 *  · antes=ID       → los `limite` anteriores a ese id (scroll hacia arriba)
 *  · despues=ID     → los posteriores a ese id (polling / reconexión)
 */
export class ListarMensajesQueryDto {
  @Type(() => Number) @IsInt() @IsPositive() @IsOptional() antes?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() despues?: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limite?: number;
}
