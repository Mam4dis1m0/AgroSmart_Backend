// src/dto/tarea.dto.ts
import { IsString, IsNumber, IsOptional, IsInt, IsDateString, Min } from 'class-validator';

// ── Sin cambios ───────────────────────────────────────────────────────────────
export class CreateTareaDto {
  @IsString()  @IsOptional() tipoactividad?: string;
  @IsString()  @IsOptional() fechaprogramada?: string;
  @IsNumber()  @IsOptional() tiempototaltarea?: number;
  @IsString()  @IsOptional() estado?: string;
  @IsString()  @IsOptional() esrecurrente?: string;
  @IsNumber()  @IsOptional() frecuenciadias?: number;
  @IsNumber()  @IsOptional() costototal?: number;
  @IsNumber()  @IsOptional() costotransporte?: number;
  @IsNumber()  @IsOptional() idadmincreador?: number;
  @IsNumber()  @IsOptional() idcultivo?: number;
}

export class UpdateTareaDto extends CreateTareaDto {}

// ── NUEVO ─────────────────────────────────────────────────────────────────────
// Body de PATCH /api/v1/tareas/:id/asignar
// Crea un registro en la tabla asignacion_tarea vinculando
// la tarea con el empleado y el admin que hace la asignación.
export class AsignarTareaDto {
  @IsInt({ message: 'idempleado debe ser un entero.' })
  @Min(1)
  idempleado: number;                   // empleado que recibirá la tarea

  @IsInt({ message: 'idadminasignador debe ser un entero.' })
  @Min(1)
  idadminasignador: number;             // admin que ejecuta la asignación

  @IsOptional()
  @IsDateString()
  fechaasignacion?: string;             // si no se envía, se usa la fecha actual

  @IsOptional()
  @IsString()
  estado?: string;                      // default: 'Asignado'

  @IsOptional()
  @IsNumber()
  pagoacordado?: number;
}