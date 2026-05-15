import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Lote } from "./Lote";
import { ProduccionPalma } from "./ProduccionPalma";

@Index("palma_pkey", ["idpalma"], { unique: true })
@Entity("palma", { schema: "public" })
export class Palma {
  @PrimaryGeneratedColumn({ type: "integer", name: "idpalma" })
  idpalma: number;

  @Column("character varying", { name: "codigo", nullable: true, length: 100 })
  codigo: string | null;

  @Column("character varying", {
    name: "variedad",
    nullable: true,
    length: 100,
  })
  variedad: string | null;

  @Column("date", { name: "fechasiembra", nullable: true })
  fechasiembra: string | null;

  @Column("character varying", {
    name: "estadosanitario",
    nullable: true,
    length: 50,
  })
  estadosanitario: string | null;

  @Column("text", { name: "observaciones", nullable: true })
  observaciones: string | null;

  @ManyToOne(() => Lote, (lote) => lote.palmas)
  @JoinColumn([{ name: "idlote", referencedColumnName: "idlote" }])
  idlote: Lote;

  @OneToMany(
    () => ProduccionPalma,
    (produccionPalma) => produccionPalma.idpalma
  )
  produccionPalmas: ProduccionPalma[];
}
