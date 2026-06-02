// src/Entidades/entities/Insumo.ts
// FIX: añadido numericTransformer a stockactual, stockminimo y costounitario.
// Sin él, TypeORM retorna los campos "numeric" de PostgreSQL como strings
// ("90.00"), haciendo que Math.round("90.00" * 100) = NaN y la resta
// de stock y la comparación con stockminimo fallen silenciosamente.
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DetalleTarea } from './DetalleTarea';
import { Administrador } from './Administrador';
import { numericTransformer } from '../../common/transformers'; // ← añadido

@Index('insumo_pkey', ['idinsumo'], { unique: true })
@Entity('insumo', { schema: 'public' })
export class Insumo {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'idinsumo' })
  idinsumo: number;

  @Column('character varying', { name: 'nombre', nullable: true, length: 100 })
  nombre: string | null;

  @Column('character varying', { name: 'tipo', nullable: true, length: 100 })
  tipo: string | null;

  // FIX: transformer añadido → llega como number, no como string "90.00"
  @Column('numeric', {
    name: 'stockactual',
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  stockactual: number | null;

  // FIX: transformer añadido
  @Column('numeric', {
    name: 'stockminimo',
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  stockminimo: number | null;

  // FIX: transformer añadido
  @Column('numeric', {
    name: 'costounitario',
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  costounitario: number | null;

  @Column('character varying', { name: 'unidadmedida', nullable: true, length: 50 })
  unidadmedida: string | null;

  @Column('date', { name: 'fechaultimaactualizacion', nullable: true })
  fechaultimaactualizacion: string | null;

  @OneToMany(() => DetalleTarea, (detalleTarea) => detalleTarea.idinsumo)
  detalleTareas: DetalleTarea[];

  @ManyToOne(() => Administrador, (administrador) => administrador.insumos)
  @JoinColumn([{ name: 'idadminregistro', referencedColumnName: 'idusuario' }])
  idadminregistro: Administrador;
}