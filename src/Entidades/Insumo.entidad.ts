import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Administrador } from './Administrador.entidad';

@Entity('insumos')
export class Insumo {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Administrador, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'admin_registro_id' })
  adminRegistro: Administrador;

  @Column({ length: 150 })
  nombre: string;

  @Column({ length: 100 })
  tipo: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  stockActual: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  stockMinimo: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  costoUnitario: number;

  @Column({ length: 50 })
  unidadMedida: string;

  @UpdateDateColumn()
  fechaUltimaActualizacion: Date;

  @CreateDateColumn()
  createdAt: Date;
}
