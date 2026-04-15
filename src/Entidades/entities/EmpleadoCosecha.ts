import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Empleado } from "./Empleado";

@Index("empleado_cosecha_pkey", ["idempleadocosecha"], { unique: true })
@Entity("empleado_cosecha", { schema: "public" })
export class EmpleadoCosecha {
  @PrimaryGeneratedColumn({ type: "integer", name: "idempleadocosecha" })
  idempleadocosecha: number;

  @Column("numeric", {
    name: "cantidadcosechada",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  cantidadcosechada: string | null;

  @Column("numeric", {
    name: "valorunitario",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  valorunitario: string | null;

  @Column("numeric", {
    name: "preciobruto",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  preciobruto: string | null;

  @Column("numeric", {
    name: "deducciones",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  deducciones: string | null;

  @Column("numeric", {
    name: "precioneto",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  precioneto: string | null;

  @Column("date", { name: "fechatrabajo", nullable: true })
  fechatrabajo: string | null;

  @Column("text", { name: "observaciones", nullable: true })
  observaciones: string | null;

  @ManyToOne(() => Empleado, (empleado) => empleado.empleadoCosechas)
  @JoinColumn([{ name: "idempleado", referencedColumnName: "idusuario" }])
  idempleado: Empleado;
}
