import { IsArray, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Lo que el administrador dijo por voz (ya convertido a texto en el celular) + contexto de la finca. */
export class InterpretarVozDto {
  @IsString()
  @IsNotEmpty({ message: 'No se escuchó nada. Habla de nuevo.' })
  @MaxLength(3000)
  texto: string;

  /** Fecha de hoy en el celular (YYYY-MM-DD), para entender «mañana», «el lunes»… */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hoy debe ser YYYY-MM-DD' })
  hoy?: string;

  /** Lo que ya existe en la finca: ayuda a la IA a no inventar ids. Solo orienta; al crear, mandan los permisos reales. */
  @IsOptional() @IsArray() lotes?: { id: number; nombre: string }[];
  @IsOptional() @IsArray() cultivos?: { id: number; tipo: string; lote?: string }[];
  @IsOptional() @IsArray() empleados?: { id: number; nombre: string }[];
}
