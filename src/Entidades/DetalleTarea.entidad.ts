import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Tarea } from './Tarea.entidad';
import { Insumo } from './Insumo.entidad';

@Entity('detalle_tareas')
export class DetalleTarea {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tarea, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tarea_id' })
  tarea: Tarea;

  @ManyToOne(() => Insumo, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'insumo_id' })
  insumo: Insumo;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  cantidadUsada: number;

  @CreateDateColumn()
  createdAt: Date;
}
