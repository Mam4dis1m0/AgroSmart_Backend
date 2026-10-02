import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// ── CU-29 · Publicar excedente ────────────────────────────────────────────────
export class CreateListadoDto {
  @IsString() @IsNotEmpty() @MaxLength(150) titulo: string;
  @IsString() @IsOptional() descripcion?: string;
  @IsString() @IsOptional() @MaxLength(60) categoria?: string;

  /** Volumen disponible para la venta (en `unidad`). */
  @IsNumber() @IsPositive() volumen: number;
  @IsString() @IsOptional() @MaxLength(20) unidad?: string;

  /** Precio de oportunidad por unidad (ej. COP 15.000 / kg). */
  @IsNumber() @Min(0) preciounitario: number;

  @IsString() @IsOptional() @MaxLength(255) ubicacion?: string;
  @IsNumber() @Min(-90) @Max(90) @IsOptional() latitud?: number;
  @IsNumber() @Min(-180) @Max(180) @IsOptional() longitud?: number;

  /** Cosecha de origen (CU-16): permite avisar si el volumen supera lo cosechado. */
  @IsInt() @IsOptional() idcosecha?: number;

  /** URLs de fotos (suba primero con POST /marketplace/fotos). Máx. 6. */
  @IsArray() @ArrayMaxSize(6) @IsUrl({ require_tld: false }, { each: true }) @IsOptional()
  fotos?: string[];

  /** true = guardar como borrador sin publicar. */
  @IsBoolean() @IsOptional() borrador?: boolean;
}

export class UpdateListadoDto {
  @IsString() @IsOptional() @MaxLength(150) titulo?: string;
  @IsString() @IsOptional() descripcion?: string;
  @IsString() @IsOptional() @MaxLength(60) categoria?: string;
  @IsNumber() @Min(0) @IsOptional() volumen?: number;
  @IsString() @IsOptional() @MaxLength(20) unidad?: string;
  @IsNumber() @Min(0) @IsOptional() preciounitario?: number;
  @IsString() @IsOptional() @MaxLength(255) ubicacion?: string;
  @IsNumber() @Min(-90) @Max(90) @IsOptional() latitud?: number;
  @IsNumber() @Min(-180) @Max(180) @IsOptional() longitud?: number;
  @IsString() @IsOptional() @IsIn(['BORRADOR', 'PUBLICADO', 'PAUSADO']) estado?: string;
  @IsArray() @ArrayMaxSize(6) @IsUrl({ require_tld: false }, { each: true }) @IsOptional()
  fotos?: string[];
}

export class FotoListadoDto {
  /** data URL base64: "data:image/jpeg;base64,..." */
  @IsString() @Matches(/^data:image\/(png|jpe?g|webp);base64,/, { message: 'La imagen debe ser PNG, JPG o WEBP en base64' })
  imagen: string;
}

// ── Catálogo (CU-30) ──────────────────────────────────────────────────────────
export class CatalogoQueryDto {
  /** Texto de la barra "Buscar productos agrícolas..." */
  @IsString() @IsOptional() @MaxLength(100) q?: string;
  @IsString() @IsOptional() @MaxLength(60) categoria?: string;

  // Ofertas cercanas: si se envía lat/lng se calcula la distancia
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) @IsOptional() lat?: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) @IsOptional() lng?: number;
  @Type(() => Number) @IsNumber() @Min(1) @Max(1000) @IsOptional() radioKm?: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit?: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() offset?: number;
}

// ── Órdenes (CU-32) ───────────────────────────────────────────────────────────
export class CreateOrdenDto {
  @IsInt() idlistado: number;
  @IsNumber() @IsPositive() cantidad: number;
  @IsString() @IsOptional() @MaxLength(255) puntoentrega?: string;
  @IsString() @IsOptional() @MaxLength(500) notas?: string;
}

// ── Carrito y wishlist (CU-46, Premium) ───────────────────────────────────────
export class CarritoItemDto {
  @IsInt() idlistado: number;
  @IsNumber() @IsPositive() cantidad: number;
}

export class WishlistItemDto {
  @IsInt() idlistado: number;
}
