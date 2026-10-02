import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

@Entity("compra_insumo", { schema: "public" })
export class CompraInsumo {
  @PrimaryGeneratedColumn({ type: "integer", name: "idcompra" })
  idcompra: number;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idinsumo" })
  idinsumo: number;

  @Column("numeric", { name: "cantidad", precision: 12, scale: 2, transformer: numericTransformer })
  cantidad: number;

  @Column("numeric", { name: "costounitario", precision: 12, scale: 2, transformer: numericTransformer })
  costounitario: number;

  /** Columna generada por la BD (cantidad * costounitario): solo lectura. */
  @Column({
    type: "numeric",
    name: "costototal",
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
    insert: false,
    update: false,
  })
  costototal: number;

  @Column("date", { name: "fechacompra", default: () => "CURRENT_DATE" })
  fechacompra: string;

  @Column("character varying", { name: "proveedor", nullable: true, length: 150 })
  proveedor: string | null;

  @Column("integer", { name: "idadminregistro", nullable: true })
  idadminregistro: number | null;
}
