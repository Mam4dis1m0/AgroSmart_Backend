
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Cultivo } from "./Cultivo";
import { Palma } from "./Palma";
import { ProduccionPalma } from "./ProduccionPalma";
import { numericTransformer } from "../../common/transformers";

@Index("lote_pkey", ["idlote"], { unique: true })
@Entity("lote", { schema: "public" })
export class Lote {
  @PrimaryGeneratedColumn({ type: "integer", name: "idlote" })
  idlote: number;

  @Column("character varying", { name: "nombre", nullable: true, length: 100 })
  nombre: string | null;

  @Column("numeric", {
    name: "areahectareas",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  areahectareas: number | null;  // ✅

  @Column("character varying", {
    name: "ubicacion",
    nullable: true,
    length: 255,
  })
  ubicacion: string | null;

  @Column("text", { name: "descripcion", nullable: true })
  descripcion: string | null;

  @Column("boolean", { name: "activo", nullable: true, default: () => "true" })
  activo: boolean | null;

  @OneToMany(() => Cultivo, (cultivo) => cultivo.idlote)
  cultivos: Cultivo[];

  @OneToMany(() => Palma, (palma) => palma.idlote)
  palmas: Palma[];

  @OneToMany(() => ProduccionPalma, (produccionPalma) => produccionPalma.idlote)
  produccionPalmas: ProduccionPalma[];
}