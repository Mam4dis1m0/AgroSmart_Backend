import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

@Entity("cosecha", { schema: "public" })
export class Cosecha {
  @PrimaryGeneratedColumn({ type: "integer", name: "idcosecha" })
  idcosecha: number;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idcultivo" })
  idcultivo: number;

  @Column("date", { name: "fechacosecha" })
  fechacosecha: string;

  @Column("numeric", { name: "cantidad", precision: 12, scale: 2, transformer: numericTransformer })
  cantidad: number;

  @Column("character varying", { name: "unidad", length: 20, default: () => "'kg'" })
  unidad: string;

  @Column("character varying", { name: "calidad", nullable: true, length: 50 })
  calidad: string | null;

  @Column("text", { name: "observaciones", nullable: true })
  observaciones: string | null;

  @Column("integer", { name: "idadminregistro", nullable: true })
  idadminregistro: number | null;
}
