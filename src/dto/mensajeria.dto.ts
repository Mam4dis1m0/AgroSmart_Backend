import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const ID_CLIENTE = /^[A-Za-z0-9_-]{8,64}$/;

/** Abrir (o recuperar) la conversación con el vendedor de una oferta. */
export class CrearHiloDto {
  @Type(() => Number) @IsInt() @IsPositive() idlistado: number;

  /** Opcional: vincula la conversación a una orden del comprador sobre esa oferta. */
  @Type(() => Number) @IsInt() @IsPositive() @IsOptional() idorden?: number;
}

export class EnviarMensajeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(2000)
  contenido: string;

  /** UUID generado por la app: si reintenta el envío, no se duplica el mensaje. */
  @Matches(ID_CLIENTE, { message: 'idcliente inválido' })
  @IsOptional()
  idcliente?: string;
}

/**
 * Mensaje que la app guardó/envió estando SIN internet (por SMS nativo o en cola).
 * Al recuperar conexión se sube para que quede en el hilo y nunca se pierda.
 */
export class MensajeOfflineDto {
  @Matches(ID_CLIENTE, { message: 'idcliente inválido' })
  idcliente: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  idhilo: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  contenido: string;

  /** Hora real en que se escribió el mensaje (ISO-8601). */
  @IsISO8601()
  fecha: string;

  /** 'SMS' si ya se entregó por SMS nativo del teléfono; 'APP' si quedó en cola. */
  @IsIn(['APP', 'SMS'])
  canal: 'APP' | 'SMS';
}

export class SincronizarMensajesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MensajeOfflineDto)
  mensajes: MensajeOfflineDto[];
}

/**
 * Foto o audio dentro de un hilo. Viaja como multipart/form-data:
 *   archivo (el binario) + tipo + duracionSeg (solo audio) + contenido (pie de foto, opcional).
 */
export class EnviarAdjuntoDto {
  @IsIn(['IMAGEN', 'AUDIO'], { message: 'tipo debe ser IMAGEN o AUDIO' })
  tipo: 'IMAGEN' | 'AUDIO';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  @IsOptional()
  duracionSeg?: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  @IsOptional()
  contenido?: string;
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
