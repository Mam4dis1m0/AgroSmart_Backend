import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { DetalleTarea } from "./DetalleTarea";
import { Administrador } from "./Administrador";

@Index("insumo_pkey", ["idinsumo"], { unique: true })
@Entity("insumo", { schema: "public" })
export class Insumo {
  @PrimaryGeneratedColumn({ type: "integer", name: "idinsumo" })
  idinsumo: number;

  @Column("character varying", { name: "nombre", nullable: true, length: 100 })
  nombre: string | null;

  @Column("character varying", { name: "tipo", nullable: true, length: 100 })
  tipo: string | null;

  @Column("numeric", {
    name: "stockactual",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  stockactual: string | null;

  @Column("numeric", {
    name: "stockminimo",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  stockminimo: string | null;

  @Column("numeric", {
    name: "costounitario",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  costounitario: string | null;

  @Column("character varying", {
    name: "unidadmedida",
    nullable: true,
    length: 50,
  })
  unidadmedida: string | null;

  @Column("date", { name: "fechaultimaactualizacion", nullable: true })
  fechaultimaactualizacion: string | null;

  @OneToMany(() => DetalleTarea, (detalleTarea) => detalleTarea.idinsumo)
  detalleTareas: DetalleTarea[];

  @ManyToOne(() => Administrador, (administrador) => administrador.insumos)
  @JoinColumn([{ name: "idadminregistro", referencedColumnName: "idusuario" }])
  idadminregistro: Administrador;
}
