import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// RF-01: la cédula es única; se aceptan 5-20 caracteres alfanuméricos / . -
const CEDULA = /^[0-9A-Za-z.\-]{5,20}$/;

// ── Registro público (CU-01 owner / CU-31 comprador) ─────────────────────────
// 'empleado' NO se registra aquí: lo crea un administrador en POST /usuarios/empleados
export class RegistrarUsuarioDto {
  @IsString() @IsNotEmpty() @MaxLength(100) primernombre: string;
  @IsString() @IsOptional() @MaxLength(100) segundonombre?: string;
  @IsString() @IsOptional() @MaxLength(100) primerapellido?: string;
  @IsString() @IsOptional() @MaxLength(100) segundoapellido?: string;

  @IsEmail() @MaxLength(150) email: string;

  @IsString() @MinLength(6) @MaxLength(100) contrasena: string;

  @IsString() @IsOptional() @MaxLength(20) telefono?: string;

  /** Obligatoria para administradores (RF-01). Opcional para compradores. */
  @IsString() @IsOptional() @Matches(CEDULA, { message: 'La cédula debe tener entre 5 y 20 caracteres alfanuméricos' })
  cedula?: string;

  /** 'admin' (dueño de finca) o 'comprador' (Marketplace). Por defecto 'admin'. */
  @IsString() @IsOptional() @IsIn(['admin', 'comprador', 'empleado'])
  role?: string;

  @IsNumber() @Min(0) @IsOptional() montomensual?: number;

  // Solo compradores (CU-34: alertas de ofertas cercanas)
  @IsString() @IsOptional() @MaxLength(255) ubicacion?: string;
  @IsNumber() @Min(-90) @Max(90) @IsOptional() latitud?: number;
  @IsNumber() @Min(-180) @Max(180) @IsOptional() longitud?: number;
}

// ── Alta de empleado por un administrador (CU-01) ────────────────────────────
export class RegistrarEmpleadoDto {
  @IsString() @IsNotEmpty() @MaxLength(100) primernombre: string;
  @IsString() @IsOptional() @MaxLength(100) segundonombre?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) primerapellido: string;
  @IsString() @IsOptional() @MaxLength(100) segundoapellido?: string;

  @IsEmail() @MaxLength(150) email: string;
  @IsString() @MinLength(6) @MaxLength(100) contrasena: string;
  @IsString() @IsOptional() @MaxLength(20) telefono?: string;

  @IsString() @Matches(CEDULA, { message: 'La cédula debe tener entre 5 y 20 caracteres alfanuméricos' })
  cedula: string;

  @IsNumber() @Min(0) @IsOptional() montoporhora?: number;
  @IsNumber() @Min(0) @IsOptional() montoporjornal?: number;
}

/** Compatibilidad con el nombre anterior. */
export class CreateUsuarioDto extends RegistrarUsuarioDto {}

// Solo campos que el usuario puede cambiar de sí mismo (o un admin de su finca).
// Correo, contraseña y estado tienen sus propios endpoints.
export class UpdateUsuarioDto {
  @IsString() @IsOptional() @MaxLength(100) primernombre?: string;
  @IsString() @IsOptional() @MaxLength(100) segundonombre?: string;
  @IsString() @IsOptional() @MaxLength(100) primerapellido?: string;
  @IsString() @IsOptional() @MaxLength(100) segundoapellido?: string;
  @IsString() @IsOptional() @MaxLength(20) telefono?: string;
  @IsString() @IsOptional() @Matches(CEDULA, { message: 'La cédula debe tener entre 5 y 20 caracteres alfanuméricos' })
  cedula?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() contrasena: string;
}

/**
 * Login con Google: el cliente envía el ID token (credential) que entrega Google;
 * el backend lo verifica contra Google. Ya NO se acepta un correo "a secas".
 */
export class LoginGoogleDto {
  @IsString() @IsNotEmpty() credential: string;
}

export class CambiarPasswordDto {
  @IsString() @IsNotEmpty() contrasenaActual: string;
  @IsString() @MinLength(6) @MaxLength(100) contrasenaNueva: string;
}

export class ForgotPasswordDto {
  @IsEmail() email: string;
}

export class ResetPasswordDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @MinLength(6) @MaxLength(100) nuevaContrasena: string;
}

export class FotoPerfilDto {
  /** data URL base64: "data:image/jpeg;base64,..." */
  @IsString() @Matches(/^data:image\/(png|jpe?g|webp);base64,/, { message: 'La imagen debe ser PNG, JPG o WEBP en base64' })
  imagen: string;
}

// CU-34: el comprador define su ubicación y radio de alertas
export class UbicacionCompradorDto {
  @IsString() @IsOptional() @MaxLength(255) ubicacion?: string;
  @IsNumber() @Min(-90) @Max(90) @IsOptional() latitud?: number;
  @IsNumber() @Min(-180) @Max(180) @IsOptional() longitud?: number;
  @IsNumber() @Min(1) @Max(500) @IsOptional() radioalertaskm?: number;
  @IsBoolean() @IsOptional() notificaciones?: boolean;
}
