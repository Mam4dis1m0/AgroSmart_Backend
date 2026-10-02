import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";
import { Listado } from "./Listado";

@Entity("orden_compra", { schema: "public" })
export class OrdenCompra {
  @PrimaryGeneratedColumn({ type: "integer", name: "idorden" })
  idorden: number;

  /** Finca vendedora */
  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idlistado" })
  idlistado: number;

  @Column("integer", { name: "idcomprador" })
  idcomprador: number;

  @Column("numeric", { name: "cantidad", precision: 12, scale: 2, transformer: numericTransformer })
  cantidad: number;

  @Column("numeric", { name: "preciounitario", precision: 12, scale: 2, transformer: numericTransformer })
  preciounitario: number;

  @Column("numeric", { name: "subtotal", precision: 14, scale: 2, transformer: numericTransformer })
  subtotal: number;

  @Column("numeric", { name: "comisionporcentaje", precision: 5, scale: 2, transformer: numericTransformer })
  comisionporcentaje: number;

  @Column("numeric", { name: "comisionvalor", precision: 14, scale: 2, transformer: numericTransformer })
  comisionvalor: number;

  @Column("numeric", { name: "netovendedor", precision: 14, scale: 2, transformer: numericTransformer })
  netovendedor: number;

  /** PENDIENTE | ACEPTADA | RECHAZADA | CERRADA | CANCELADA */
  @Column("character varying", { name: "estado", length: 20, default: () => "'PENDIENTE'" })
  estado: string;

  @Column("character varying", { name: "puntoentrega", nullable: true, length: 255 })
  puntoentrega: string | null;

  @Column("text", { name: "notas", nullable: true })
  notas: string | null;

  @Column("timestamp with time zone", { name: "fechaaceptacion", nullable: true })
  fechaaceptacion: Date | null;

  @Column("timestamp with time zone", { name: "fechacierre", nullable: true })
  fechacierre: Date | null;

  @Column({ type: "timestamp with time zone", name: "created_at", default: () => "now()", update: false })
  createdAt: Date;

  @ManyToOne(() => Listado)
  @JoinColumn([{ name: "idlistado", referencedColumnName: "idlistado" }])
  listado: Listado;
}
