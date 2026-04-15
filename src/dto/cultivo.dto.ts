import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateCultivoDto {
  @IsString() @IsOptional() nombrelote?: string;
  @IsString() @IsOptional() fechasiembra?: string;
  @IsString() @IsOptional() fechacosechaestimada?: string;
  @IsString() @IsOptional() alertan8n?: string;
  @IsNumber() @IsOptional() idadminsupervisor?: number;
  @IsNumber() @IsOptional() idlote?: number;
}

export class UpdateCultivoDto extends CreateCultivoDto {}