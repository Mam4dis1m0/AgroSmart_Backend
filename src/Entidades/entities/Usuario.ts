import {
  Column,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Administrador } from "./Administrador";
import { Empleado } from "./Empleado";

@Index("usuario_email_key", ["email"], { unique: true })
@Index("usuario_pkey", ["idusuario"], { unique: true })
@Entity("usuario", { schema: "public" })
export class Usuario {
  @PrimaryGeneratedColumn({ type: "integer", name: "idusuario" })
  idusuario: number;

  @Column("character varying", {
    name: "primernombre",
    nullable: true,
    length: 100,
  })
  primernombre: string | null;

  @Column("character varying", {
    name: "segundonombre",
    nullable: true,
    length: 100,
  })
  segundonombre: string | null;

  @Column("character varying", {
    name: "primerapellido",
    nullable: true,
    length: 100,
  })
  primerapellido: string | null;

  @Column("character varying", {
    name: "segundoapellido",
    nullable: true,
    length: 100,
  })
  segundoapellido: string | null;

  @Column("character varying", {
    name: "email",
    nullable: true,
    unique: true,
    length: 150,
  })
  email: string | null;

  // select:false → el hash NUNCA viaja en respuestas ni en el caché por accidente
  // (antes salía en /empleados y /tareas por las relaciones). Para leerlo:
  // createQueryBuilder('u').addSelect('u.contrasena')
  @Column("character varying", {
    name: "contrasena",
    nullable: true,
    length: 255,
    select: false,
  })
  contrasena: string | null;

  @Column("character varying", { name: "telefono", nullable: true, length: 20 })
  telefono: string | null;

  /** RF-01: cédula única (índice parcial en BD: los usuarios antiguos pueden no tenerla). */
  @Column("character varying", { name: "cedula", nullable: true, length: 20 })
  cedula: string | null;

  @Column("text", { name: "fotoperfil", nullable: true })
  fotoperfil: string | null;

  /** RNF-11: un usuario inactivo no puede autenticarse. */
  @Column("boolean", { name: "activo", default: () => "true" })
  activo: boolean;

  @OneToOne(() => Administrador, (administrador) => administrador.idusuario2)
  administrador: Administrador;

  @OneToOne(() => Empleado, (empleado) => empleado.idusuario2)
  empleado: Empleado;
}
