import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Empleado } from "./Empleado";
import { numericTransformer } from "../../common/transformers";

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
    transformer: numericTransformer,
  })
  cantidadcosechada: number | null;  // ✅

  @Column("numeric", {
    name: "valorunitario",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  valorunitario: number | null;  // ✅

  @Column("numeric", {
    name: "preciobruto",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  preciobruto: number | null;  // ✅

  @Column("numeric", {
    name: "deducciones",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  deducciones: number | null;  // ✅

  @Column("numeric", {
    name: "precioneto",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  precioneto: number | null;  // ✅

  @Column("date", { name: "fechatrabajo", nullable: true })
  fechatrabajo: string | null;

  @Column("text", { name: "observaciones", nullable: true })
  observaciones: string | null;

  @ManyToOne(() => Empleado, (empleado) => empleado.empleadoCosechas)
  @JoinColumn([{ name: "idempleado", referencedColumnName: "idusuario" }])
  idempleado: Empleado;
}