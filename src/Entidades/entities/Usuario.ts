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

  @Column("character varying", {
    name: "contrasena",
    nullable: true,
    length: 255,
  })
  contrasena: string | null;

  @Column("character varying", { name: "telefono", nullable: true, length: 20 })
  telefono: string | null;

  @OneToOne(() => Administrador, (administrador) => administrador.idusuario2)
  administrador: Administrador;

  @OneToOne(() => Empleado, (empleado) => empleado.idusuario2)
  empleado: Empleado;
}
