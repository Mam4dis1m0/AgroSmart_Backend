import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Foto (y nota) que respalda la ejecución de una tarea. */
@Index('tarea_evidencia_pkey', ['idevidencia'], { unique: true })
@Entity('tarea_evidencia', { schema: 'public' })
export class TareaEvidencia {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'idevidencia' })
  idevidencia: number;

  /** Tenant (finca dueña del dato) */
  @Column('integer', { name: 'idfinca' })
  idfinca: number;

  @Column('integer', { name: 'idtarea' })
  idtarea: number;

  @Column('integer', { name: 'idasigtarea', nullable: true })
  idasigtarea: number | null;

  @Column('integer', { name: 'idusuario', nullable: true })
  idusuario: number | null;

  @Column('text', { name: 'url' })
  url: string;

  @Column('text', { name: 'observaciones', nullable: true })
  observaciones: string | null;

  @Column('timestamp without time zone', {
    name: 'fecha',
    default: () => 'now()',
  })
  fecha: Date;
}
