import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Finca } from "./Finca";
import { Usuario } from "./Usuario";

/** Pertenencia de un usuario a una finca y su rol dentro de ella. */
@Index("finca_usuario_unico", ["idfinca", "idusuario"], { unique: true })
@Entity("finca_usuario", { schema: "public" })
export class FincaUsuario {
  @PrimaryGeneratedColumn({ type: "integer", name: "idfincausuario" })
  idfincausuario: number;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idusuario" })
  idusuario: number;

  /** admin | empleado */
  @Column("character varying", { name: "rol", length: 20 })
  rol: "admin" | "empleado";

  @Column("boolean", { name: "activo", default: () => "true" })
  activo: boolean;

  @Column("date", { name: "fechaingreso", default: () => "CURRENT_DATE" })
  fechaingreso: string;

  @ManyToOne(() => Finca, (f) => f.miembros, { onDelete: "CASCADE" })
  @JoinColumn([{ name: "idfinca", referencedColumnName: "idfinca" }])
  finca: Finca;

  @ManyToOne(() => Usuario, { onDelete: "CASCADE" })
  @JoinColumn([{ name: "idusuario", referencedColumnName: "idusuario" }])
  usuario: Usuario;
}
