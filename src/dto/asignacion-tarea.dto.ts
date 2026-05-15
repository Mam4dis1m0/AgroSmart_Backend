import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateAsignacionTareaDto {
  @IsString() @IsOptional() fechaasignacion?: string;
  @IsString() @IsOptional() estado?: string;
  @IsNumber() @IsOptional() horastrabajadas?: number;
  @IsNumber() @IsOptional() jornadastrabajadas?: number;
  @IsNumber() @IsOptional() pagoacordado?: number;
  @IsNumber() @IsOptional() idadminasignador?: number;
  @IsNumber() @IsOptional() idempleado?: number;
  @IsNumber() @IsOptional() idtarea?: number;
}

export class UpdateAsignacionTareaDto extends CreateAsignacionTareaDto {}