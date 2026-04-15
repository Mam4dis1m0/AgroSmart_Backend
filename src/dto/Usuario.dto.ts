import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateUsuarioDto {
  @IsString() @IsOptional() primernombre?: string;
  @IsString() @IsOptional() segundonombre?: string;
  @IsString() @IsOptional() primerapellido?: string;
  @IsString() @IsOptional() segundoapellido?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() contrasena?: string;
  @IsString() @IsOptional() telefono?: string;
}

export class UpdateUsuarioDto extends CreateUsuarioDto {}