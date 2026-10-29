import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateCultivoDto {
  @IsString() @IsOptional() nombrelote?: string;
  @IsString() @IsOptional() tipo?: string; // CU-05: maíz, café, palma...
  @IsString() @IsOptional() categoria?: string; // categoría de manejo (decide las plantillas de labores)
  @IsBoolean() @IsOptional() activo?: boolean;
  @IsString() @IsOptional() fechasiembra?: string;
  @IsString() @IsOptional() fechacosechaestimada?: string;
  @IsString() @IsOptional() alertan8n?: string;
  @IsNumber() @IsOptional() idadminsupervisor?: number;
  @IsNumber() @IsOptional() idlote?: number;
}

export class UpdateCultivoDto extends CreateCultivoDto {}
