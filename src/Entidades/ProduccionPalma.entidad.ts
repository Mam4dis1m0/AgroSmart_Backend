import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Palma } from './Palma.entidad';
import { Lote } from './Lote.entidad';

export enum CalidadProduccion {
  A = 'A',
  B = 'B',
  C = 'C',
}

@Entity('produccion_palmas')
export class ProduccionPalma {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Palma, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'palma_id' })
  palma: Palma;

  @ManyToOne(() => Lote, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lote_id' })
  lote: Lote;

  @CreateDateColumn()
  fechaRegistro: Date;

  @Column({ type: 'int', unsigned: true })
  cantidadRacimos: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pesoKg: number;

  @Column({
    type: 'enum',
    enum: CalidadProduccion,
    default: CalidadProduccion.A,
  })
  calidad: CalidadProduccion;

  @Column({ type: 'text', nullable: true })
  observaciones: string;
}
