import { IsInt, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';

/** Un día normal de trabajo en la finca. */
export class JornadaDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de entrada debe tener formato HH:MM' })
  jornadainicio: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de salida debe tener formato HH:MM' })
  jornadafin: string;

  @IsInt() @Min(0) @Max(480)
  jornadadescanso: number;

  /** null = todos los empleados activos. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(1000)
  jornadapersonas?: number | null;
}
