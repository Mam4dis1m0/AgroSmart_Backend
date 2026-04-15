import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Insumo } from './Insumo';
import { Tarea } from './Tarea';

@Index('detalle_tarea_pkey', ['iddetalletarea'], { unique: true })
@Entity('detalle_tarea', { schema: 'public' })
export class DetalleTarea {
  @PrimaryGeneratedColumn({ type: 'integer', name: 'iddetalletarea' })
  iddetalletarea: number;

  @Column('numeric', {
    name: 'cantidadusada',
    nullable: true,
    precision: 10,
    scale: 2,
  })
  cantidadusada: string | null;

  @ManyToOne(() => Insumo, (insumo) => insumo.detalleTareas)
  @JoinColumn([{ name: 'idinsumo', referencedColumnName: 'idinsumo' }])
  idinsumo: Insumo;

  @ManyToOne(() => Tarea, (tarea) => tarea.detalleTareas)
  @JoinColumn([{ name: 'idtarea', referencedColumnName: 'idtarea' }])
  idtarea: Tarea;
}
