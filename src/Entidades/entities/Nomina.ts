import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";
import { NominaDetalle } from "./NominaDetalle";

@Entity("nomina", { schema: "public" })
export class Nomina {
  @PrimaryGeneratedColumn({ type: "integer", name: "idnomina" })
  idnomina: number;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("date", { name: "fechainicio" })
  fechainicio: string;

  @Column("date", { name: "fechafin" })
  fechafin: string;

  /** BORRADOR | CONFIRMADA | PAGADA */
  @Column("character varying", { name: "estado", length: 20, default: () => "'BORRADOR'" })
  estado: string;

  @Column("numeric", { name: "total", precision: 14, scale: 2, transformer: numericTransformer, default: () => "0" })
  total: number;

  @Column("integer", { name: "idadmin", nullable: true })
  idadmin: number | null;

  @OneToMany(() => NominaDetalle, (d) => d.nomina, { cascade: ["insert"] })
  detalles: NominaDetalle[];
}
