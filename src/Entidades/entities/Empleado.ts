import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { AsignacionTarea } from './AsignacionTarea';
import { Usuario } from './Usuario';
import { EmpleadoCosecha } from './EmpleadoCosecha';
import { numericTransformer } from '../../common/transformers';

@Index('empleado_pkey', ['idusuario'], { unique: true })
@Entity('empleado', { schema: 'public' })
export class Empleado {
  @Column('integer', { primary: true, name: 'idusuario' })
  idusuario: number;

  @Column('numeric', {
    name: 'montoporhora',
    nullable: true,
    precision: 10,
    scale: 2,
  })
  montoporhora: number | null;

  @Column('numeric', {
    name: 'montoporjornal',
    nullable: true,
    precision: 10,
    scale: 2,
  })
  montoporjornal: number | null;

  /** Cómo se le paga: dia | semana | mes. Las tarifas por hora/jornal de arriba ya no se usan. */
  @Column('character varying', {
    name: 'tipopago',
    length: 10,
    default: () => "'dia'",
  })
  tipopago: string;

  /** Cuánto se le paga por cada día, semana o mes (según tipopago). */
  @Column('numeric', {
    name: 'valorpago',
    precision: 12,
    scale: 2,
    default: () => '0',
    transformer: numericTransformer,
  })
  valorpago: number;

  @OneToMany(
    () => AsignacionTarea,
    (asignacionTarea) => asignacionTarea.idempleado,
  )
  asignacionTareas: AsignacionTarea[];

  @OneToOne(() => Usuario, (usuario) => usuario.empleado)
  @JoinColumn([{ name: 'idusuario', referencedColumnName: 'idusuario' }])
  idusuario2: Usuario;

  @OneToMany(
    () => EmpleadoCosecha,
    (empleadoCosecha) => empleadoCosecha.idempleado,
  )
  empleadoCosechas: EmpleadoCosecha[];
}
