import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Cultivo } from './Cultivo.entidad';
import { Administrador } from './Administrador.entidad';

export enum EstadoTarea {
  PENDIENTE = 'PENDIENTE',
  EN_PROCESO = 'EN_PROCESO',
  TERMINADA = 'TERMINADA',
}

export enum TipoActividad {
  COSECHA = 'COSECHA',
  FUMIGACION = 'FUMIGACION',
  PODA = 'PODA',
  RIEGO = 'RIEGO',
  FERTILIZACION = 'FERTILIZACION',
  MANTENIMIENTO = 'MANTENIMIENTO',
  OTRO = 'OTRO',
}

@Entity('tareas')
export class Tarea {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Cultivo, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cultivo_id' })
  cultivo: Cultivo;

  @ManyToOne(() => Administrador, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'admin_creador_id' })
  adminCreador: Administrador;

  @Column({ type: 'enum', enum: TipoActividad })
  tipoActividad: TipoActividad;

  @Column({ type: 'timestamp' })
  fechaProgramada: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.00 })
  tiempoTotalTarea: number;

  @Column({ type: 'enum', enum: EstadoTarea, default: EstadoTarea.PENDIENTE })
  estado: EstadoTarea;

  @Column({ default: false })
  esRecurrente: boolean;

  @Column({ type: 'int', default: 0 })
  frecuenciaDias: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  costoTotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  costoTransporte: number;

  // ── Atributos de cosecha (solo aplican cuando tipoActividad === COSECHA) ──
 @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
cosechaCantidadObtenida: number | null;

@Column({ type: 'varchar', length: 50, nullable: true })
cosechaUnidadMedida: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
