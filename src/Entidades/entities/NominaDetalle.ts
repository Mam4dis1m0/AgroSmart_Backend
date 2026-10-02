import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";
import { Nomina } from "./Nomina";

@Entity("nomina_detalle", { schema: "public" })
export class NominaDetalle {
  @PrimaryGeneratedColumn({ type: "integer", name: "idnominadetalle" })
  idnominadetalle: number;

  @Column("integer", { name: "idnomina" })
  idnomina: number;

  @Column("integer", { name: "idempleado" })
  idempleado: number;

  @Column("numeric", { name: "horas", precision: 10, scale: 2, transformer: numericTransformer })
  horas: number;

  @Column("numeric", { name: "jornadas", precision: 10, scale: 2, transformer: numericTransformer })
  jornadas: number;

  @Column("numeric", { name: "valorhora", precision: 12, scale: 2, transformer: numericTransformer })
  valorhora: number;

  @Column("numeric", { name: "valorjornal", precision: 12, scale: 2, transformer: numericTransformer })
  valorjornal: number;

  @Column("numeric", { name: "bruto", precision: 14, scale: 2, transformer: numericTransformer })
  bruto: number;

  @Column("numeric", { name: "deducciones", precision: 14, scale: 2, transformer: numericTransformer, default: () => "0" })
  deducciones: number;

  @Column("numeric", { name: "neto", precision: 14, scale: 2, transformer: numericTransformer })
  neto: number;

  @Column("boolean", { name: "pagado", default: () => "false" })
  pagado: boolean;

  @Column("date", { name: "fechapago", nullable: true })
  fechapago: string | null;

  @ManyToOne(() => Nomina, (n) => n.detalles, { onDelete: "CASCADE" })
  @JoinColumn([{ name: "idnomina", referencedColumnName: "idnomina" }])
  nomina: Nomina;
}
