import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/transformers';

/**
 * Labor tipo de una categoría de cultivo (p. ej. "Fertilización a los 20 días de la siembra").
 * idfinca null = catálogo base de AgroSmart; cada finca trabaja con su propia copia editable.
 */
@Index('plantilla_labor_pkey', ['idplantilla'], { unique: true })
@Entity('plantilla_labor', { schema: 'public' })
export class PlantillaLabor {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'idplantilla' })
  idplantilla: number;

  @Column('integer', { name: 'idfinca', nullable: true })
  idfinca: number | null;

  /** Plantilla base de la que se copió (null si es base o se creó en la finca). */
  @Column('integer', { name: 'idplantillabase', nullable: true })
  idplantillabase: number | null;

  @Column('character varying', { name: 'categoria', length: 40 })
  categoria: string;

  @Column('character varying', {
    name: 'tipocultivo',
    nullable: true,
    length: 100,
  })
  tipocultivo: string | null;

  @Column('character varying', { name: 'actividad', length: 50 })
  actividad: string;

  @Column('character varying', { name: 'etapa', nullable: true, length: 50 })
  etapa: string | null;

  /** Fecha de referencia: siembra | cosecha_estimada | inicio (hoy / alta del cultivo). */
  @Column('character varying', {
    name: 'base',
    length: 20,
    default: () => "'siembra'",
  })
  base: string;

  /** Días respecto de la base; puede ser negativo (preparar el suelo antes de sembrar). */
  @Column('integer', { name: 'diasoffset', default: () => '0' })
  diasoffset: number;

  @Column('boolean', { name: 'esrecurrente', default: () => 'false' })
  esrecurrente: boolean;

  @Column('integer', { name: 'frecuenciadias', nullable: true })
  frecuenciadias: number | null;

  /** Repetir hasta N días después de la base. */
  @Column('integer', { name: 'diasfin', nullable: true })
  diasfin: number | null;

  @Column('numeric', {
    name: 'horasestimadas',
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  horasestimadas: number | null;

  @Column('integer', { name: 'numpersonas', default: () => '1' })
  numpersonas: number;

  @Column('character varying', {
    name: 'prioridad',
    length: 10,
    default: () => "'Media'",
  })
  prioridad: string;

  /** tiempo = tarifa × tiempo; fijo = pago acordado (cosecha, destajo). */
  @Column('character varying', {
    name: 'modalidadpago',
    length: 10,
    default: () => "'tiempo'",
  })
  modalidadpago: string;

  @Column('boolean', { name: 'activa', default: () => 'true' })
  activa: boolean;
}
