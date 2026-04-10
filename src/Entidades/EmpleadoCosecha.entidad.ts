import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Empleado } from './Empleado.entidad';
import { Tarea } from './Tarea.entidad';

@Entity('empleados_cosecha')
export class EmpleadoCosecha {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Empleado, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empleado_id' })
  empleado: Empleado;

  // Relación hacia la Tarea de tipo COSECHA
  @ManyToOne(() => Tarea, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cosecha_id' })
  cosecha: Tarea;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  cantidadCosechada: number;

  // ── Campos de pago ──
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  valorUnitario: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  precioBruto: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  deducciones: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  precioNeto: number;

  // ── Campos adicionales ──
  @Column({ type: 'date' })
  fechaTrabajo: Date;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @CreateDateColumn()
  createdAt: Date;
}
