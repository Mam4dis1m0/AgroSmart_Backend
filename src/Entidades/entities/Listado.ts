import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";
import { ListadoFoto } from "./ListadoFoto";

/** Publicación de un lote excedente en el Marketplace "MarketFields". */
@Entity("listado", { schema: "public" })
export class Listado {
  @PrimaryGeneratedColumn({ type: "integer", name: "idlistado" })
  idlistado: number;

  /** Finca vendedora */
  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idvendedor" })
  idvendedor: number;

  @Column("integer", { name: "idcosecha", nullable: true })
  idcosecha: number | null;

  @Column("character varying", { name: "titulo", length: 150 })
  titulo: string;

  @Column("text", { name: "descripcion", nullable: true })
  descripcion: string | null;

  @Column("character varying", { name: "categoria", nullable: true, length: 60 })
  categoria: string | null;

  @Column("numeric", { name: "volumeninicial", precision: 12, scale: 2, transformer: numericTransformer })
  volumeninicial: number;

  @Column("numeric", { name: "volumendisponible", precision: 12, scale: 2, transformer: numericTransformer })
  volumendisponible: number;

  @Column("character varying", { name: "unidad", length: 20, default: () => "'kg'" })
  unidad: string;

  @Column("numeric", { name: "preciounitario", precision: 12, scale: 2, transformer: numericTransformer })
  preciounitario: number;

  @Column("character varying", { name: "moneda", length: 3, default: () => "'COP'" })
  moneda: string;

  @Column("character varying", { name: "ubicacion", nullable: true, length: 255 })
  ubicacion: string | null;

  @Column("numeric", { name: "latitud", nullable: true, precision: 9, scale: 6, transformer: numericTransformer })
  latitud: number | null;

  @Column("numeric", { name: "longitud", nullable: true, precision: 9, scale: 6, transformer: numericTransformer })
  longitud: number | null;

  /** BORRADOR | PUBLICADO | PAUSADO | AGOTADO */
  @Column("character varying", { name: "estado", length: 20, default: () => "'PUBLICADO'" })
  estado: string;

  @Column("boolean", { name: "destacado", default: () => "false" })
  destacado: boolean;

  @Column("timestamp with time zone", { name: "destacadohasta", nullable: true })
  destacadohasta: Date | null;

  @Column("timestamp with time zone", { name: "earlyaccesshasta", nullable: true })
  earlyaccesshasta: Date | null;

  @Column({ type: "timestamp with time zone", name: "created_at", default: () => "now()", update: false })
  createdAt: Date;

  @OneToMany(() => ListadoFoto, (f) => f.listado, { cascade: ["insert"] })
  fotos: ListadoFoto[];
}
