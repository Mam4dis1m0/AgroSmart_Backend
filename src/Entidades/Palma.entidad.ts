import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Lote } from './Lote.entidad';

export enum EstadoSanitario {
  SANO = 'SANO',
  EN_TRATAMIENTO = 'EN_TRATAMIENTO',
  BAJO_OBSERVACION = 'BAJO_OBSERVACION',
}

@Entity('palmas')
export class Palma {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Lote, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lote_id' })
  lote: Lote;

  @Column({ length: 100, unique: true })
  codigo: string;

  @Column({ length: 100 })
  variedad: string;

  @Column({ type: 'date' })
  fechaSiembra: Date;

  @Column({
    type: 'enum',
    enum: EstadoSanitario,
    default: EstadoSanitario.SANO,
  })
  estadoSanitario: EstadoSanitario;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @CreateDateColumn()
  createdAt: Date;
}
