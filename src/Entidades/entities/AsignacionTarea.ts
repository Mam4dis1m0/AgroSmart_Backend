import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Administrador } from "./Administrador";
import { Empleado } from "./Empleado";
import { Tarea } from "./Tarea";

@Index("asignacion_tarea_pkey", ["idasigtarea"], { unique: true })
@Entity("asignacion_tarea", { schema: "public" })
export class AsignacionTarea {
  @PrimaryGeneratedColumn({ type: "integer", name: "idasigtarea" })
  idasigtarea: number;

  @Column("date", { name: "fechaasignacion", nullable: true })
  fechaasignacion: string | null;

  @Column("character varying", { name: "estado", nullable: true, length: 50 })
  estado: string | null;

  @Column("numeric", {
    name: "horastrabajadas",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  horastrabajadas: string | null;

  @Column("numeric", {
    name: "jornadastrabajadas",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  jornadastrabajadas: string | null;

  @Column("numeric", {
    name: "pagoacordado",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  pagoacordado: string | null;

  @ManyToOne(
    () => Administrador,
    (administrador) => administrador.asignacionTareas
  )
  @JoinColumn([{ name: "idadminasignador", referencedColumnName: "idusuario" }])
  idadminasignador: Administrador;

  @ManyToOne(() => Empleado, (empleado) => empleado.asignacionTareas)
  @JoinColumn([{ name: "idempleado", referencedColumnName: "idusuario" }])
  idempleado: Empleado;

  @ManyToOne(() => Tarea, (tarea) => tarea.asignacionTareas)
  @JoinColumn([{ name: "idtarea", referencedColumnName: "idtarea" }])
  idtarea: Tarea;
}
