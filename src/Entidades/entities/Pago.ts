import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

/** Pagos de la plataforma: suscripciones, listados destacados y comisiones. */
@Entity("pago", { schema: "public" })
export class Pago {
  @PrimaryGeneratedColumn({ type: "integer", name: "idpago" })
  idpago: number;

  @Column("integer", { name: "idfinca", nullable: true })
  idfinca: number | null;

  @Column("integer", { name: "idusuario", nullable: true })
  idusuario: number | null;

  /** SUSCRIPCION | LISTADO_DESTACADO | COMISION_MARKETPLACE */
  @Column("character varying", { name: "tipo", length: 30 })
  tipo: string;

  @Column("numeric", { name: "monto", precision: 12, scale: 2, transformer: numericTransformer })
  monto: number;

  @Column("character varying", { name: "moneda", length: 3, default: () => "'COP'" })
  moneda: string;

  /** PENDIENTE | APROBADO | FALLIDO | REEMBOLSADO */
  @Column("character varying", { name: "estado", length: 20, default: () => "'PENDIENTE'" })
  estado: string;

  @Column("character varying", { name: "proveedor", nullable: true, length: 50 })
  proveedor: string | null;

  @Column("character varying", { name: "referenciaexterna", nullable: true, length: 150 })
  referenciaexterna: string | null;

  @Column("jsonb", { name: "detalle", nullable: true })
  detalle: object | null;

  @Column({ type: "timestamp with time zone", name: "created_at", default: () => "now()", update: false })
  createdAt: Date;
}
