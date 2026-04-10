import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Administrador } from './Administrador.entidad';

@Entity('cultivos')
export class Cultivo {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Administrador, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'admin_supervisor_id' })
  adminSupervisor: Administrador;

  @Column({ length: 150 })
  nombreLote: string;

  @Column({ type: 'date' })
  fechaSiembra: Date;

  @Column({ type: 'date' })
  fechaCosechaEstimada: Date;

  @Column({ length: 255, nullable: true })
  alertaN8n: string;

  @CreateDateColumn()
  createdAt: Date;
}
