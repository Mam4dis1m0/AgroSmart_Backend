import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import { AsignacionTarea } from "./AsignacionTarea";
import { Usuario } from "./Usuario";
import { EmpleadoCosecha } from "./EmpleadoCosecha";

@Index("empleado_pkey", ["idusuario"], { unique: true })
@Entity("empleado", { schema: "public" })
export class Empleado {
  @Column("integer", { primary: true, name: "idusuario" })
  idusuario: number;

  @Column("numeric", {
    name: "montoporhora",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  montoporhora: string | null;

  @Column("numeric", {
    name: "montoporjornal",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  montoporjornal: string | null;

  @OneToMany(
    () => AsignacionTarea,
    (asignacionTarea) => asignacionTarea.idempleado
  )
  asignacionTareas: AsignacionTarea[];

  @OneToOne(() => Usuario, (usuario) => usuario.empleado)
  @JoinColumn([{ name: "idusuario", referencedColumnName: "idusuario" }])
  idusuario2: Usuario;

  @OneToMany(
    () => EmpleadoCosecha,
    (empleadoCosecha) => empleadoCosecha.idempleado
  )
  empleadoCosechas: EmpleadoCosecha[];
}
