import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Tarea } from './Tarea.entidad';
import { Empleado } from './Empleado.entidad';
import { Administrador } from './Administrador.entidad';

export enum EstadoAsignacion {
  PENDIENTE = 'PENDIENTE',
  EN_PROCESO = 'EN_PROCESO',
  TERMINADA = 'TERMINADA',
}

@Entity('asignaciones_tareas')
export class AsignacionTarea {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tarea, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tarea_id' })
  tarea: Tarea;

  @ManyToOne(() => Empleado, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Empleado;

  @ManyToOne(() => Administrador, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'admin_asignador_id' })
  adminAsignador: Administrador;

  @CreateDateColumn()
  fechaAsignacion: Date;

  @Column({ type: 'enum', enum: EstadoAsignacion, default: EstadoAsignacion.PENDIENTE })
  estado: EstadoAsignacion;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  horasTrabajadas: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  jornadasTrabajadas: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  pagoAcordado: number | null;
}
