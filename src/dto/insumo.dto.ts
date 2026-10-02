import { IsString, IsNumber, IsOptional, IsEmail, IsPositive, Min, MaxLength, IsDateString, IsBoolean } from 'class-validator';

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

// CU-15 · Registrar compra de insumo (actualiza el stock automáticamente)
export class CreateCompraInsumoDto {
  @IsNumber() @IsPositive()                 cantidad: number;
  @IsNumber() @Min(0)                       costounitario: number;
  @IsDateString() @IsOptional()             fechacompra?: string;   // YYYY-MM-DD
  @IsString() @IsOptional() @MaxLength(150) proveedor?: string;
  /** Si es true, el costo unitario del insumo pasa a ser el de esta compra. */
  @IsBoolean() @IsOptional()                actualizarCostoUnitario?: boolean;
}
