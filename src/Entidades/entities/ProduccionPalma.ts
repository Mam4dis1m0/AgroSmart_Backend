import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Lote } from "./Lote";
import { Palma } from "./Palma";

@Index("produccion_palma_pkey", ["idproduccionpalma"], { unique: true })
@Entity("produccion_palma", { schema: "public" })
export class ProduccionPalma {
  @PrimaryGeneratedColumn({ type: "integer", name: "idproduccionpalma" })
  idproduccionpalma: number;

  @Column("date", { name: "fecharegistro", nullable: true })
  fecharegistro: string | null;

  @Column("integer", { name: "cantidadracimos", nullable: true })
  cantidadracimos: number | null;

  @Column("numeric", {
    name: "pesokg",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  pesokg: string | null;

  @Column("character varying", { name: "calidad", nullable: true, length: 10 })
  calidad: string | null;

  @Column("text", { name: "observaciones", nullable: true })
  observaciones: string | null;

  @ManyToOne(() => Lote, (lote) => lote.produccionPalmas)
  @JoinColumn([{ name: "idlote", referencedColumnName: "idlote" }])
  idlote: Lote;

  @ManyToOne(() => Palma, (palma) => palma.produccionPalmas)
  @JoinColumn([{ name: "idpalma", referencedColumnName: "idpalma" }])
  idpalma: Palma;
}
