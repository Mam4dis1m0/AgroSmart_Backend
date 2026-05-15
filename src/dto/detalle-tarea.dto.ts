import { IsNumber, IsOptional } from 'class-validator';

export class CreateDetalleTareaDto {
  @IsNumber() @IsOptional() cantidadusada?: number;
  @IsNumber() @IsOptional() idinsumo?: number;
  @IsNumber() @IsOptional() idtarea?: number;
}

export class UpdateDetalleTareaDto extends CreateDetalleTareaDto {}