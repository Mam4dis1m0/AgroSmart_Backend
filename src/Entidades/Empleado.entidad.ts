import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Usuario } from './Usuario.entidad';

@Entity('empleados')
export class Empleado {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  montoPorHora: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  montoPorJornal: number;

  @CreateDateColumn()
  createdAt: Date;
}
