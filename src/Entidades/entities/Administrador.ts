import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import { Usuario } from "./Usuario";
import { AsignacionTarea } from "./AsignacionTarea";
import { Cultivo } from "./Cultivo";
import { Insumo } from "./Insumo";
import { Tarea } from "./Tarea";

@Index("administrador_pkey", ["idusuario"], { unique: true })
@Entity("administrador", { schema: "public" })
export class Administrador {
  @Column("integer", { primary: true, name: "idusuario" })
  idusuario: number;

  @Column("numeric", {
    name: "montomensual",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  montomensual: string | null;

  @OneToOne(() => Usuario, (usuario) => usuario.administrador)
  @JoinColumn([{ name: "idusuario", referencedColumnName: "idusuario" }])
  idusuario2: Usuario;

  @OneToMany(
    () => AsignacionTarea,
    (asignacionTarea) => asignacionTarea.idadminasignador
  )
  asignacionTareas: AsignacionTarea[];

  @OneToMany(() => Cultivo, (cultivo) => cultivo.idadminsupervisor)
  cultivos: Cultivo[];

  @OneToMany(() => Insumo, (insumo) => insumo.idadminregistro)
  insumos: Insumo[];

  @OneToMany(() => Tarea, (tarea) => tarea.idadmincreador)
  tareas: Tarea[];
}
