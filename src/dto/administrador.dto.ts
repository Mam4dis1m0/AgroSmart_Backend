import { IsNumber, IsOptional } from 'class-validator';

export class CreateAdministradorDto {
  @IsNumber() idusuario: number;
  @IsNumber() @IsOptional() montomensual?: number;
}

export class UpdateAdministradorDto extends CreateAdministradorDto {}