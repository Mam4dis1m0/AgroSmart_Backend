import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

@Entity("plan", { schema: "public" })
export class Plan {
  @PrimaryGeneratedColumn({ type: "integer", name: "idplan" })
  idplan: number;

  /** FREEMIUM | PREMIUM */
  @Column("character varying", { name: "codigo", length: 20, unique: true })
  codigo: string;

  @Column("character varying", { name: "nombre", length: 60 })
  nombre: string;

  @Column("text", { name: "descripcion", nullable: true })
  descripcion: string | null;

  @Column("numeric", { name: "preciomensual", precision: 12, scale: 2, transformer: numericTransformer })
  preciomensual: number;

  @Column("character varying", { name: "moneda", length: 3, default: () => "'COP'" })
  moneda: string;

  /** null = ilimitado */
  @Column("integer", { name: "maxcultivos", nullable: true })
  maxcultivos: number | null;

  @Column("integer", { name: "maxempleados", nullable: true })
  maxempleados: number | null;

  @Column("integer", { name: "maxfincas", nullable: true })
  maxfincas: number | null;

  /** % que retiene AgroSmart por venta del Marketplace */
  @Column("numeric", { name: "comisionmarketplace", precision: 5, scale: 2, transformer: numericTransformer })
  comisionmarketplace: number;

  @Column("jsonb", { name: "funciones", default: () => "'{}'" })
  funciones: Record<string, boolean>;

  @Column("boolean", { name: "activo", default: () => "true" })
  activo: boolean;
}
