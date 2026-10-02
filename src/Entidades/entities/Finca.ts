import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Plan } from "./Plan";
import { FincaUsuario } from "./FincaUsuario";
import { numericTransformer } from "../../common/transformers";

/** Tenant: cada finca tiene sus propios cultivos, tareas, insumos, ventas y gastos (RF-33). */
@Index("finca_pkey", ["idfinca"], { unique: true })
@Entity("finca", { schema: "public" })
export class Finca {
  @PrimaryGeneratedColumn({ type: "integer", name: "idfinca" })
  idfinca: number;

  @Column("character varying", { name: "nombre", length: 150 })
  nombre: string;

  @Column("character varying", { name: "ubicacion", nullable: true, length: 255 })
  ubicacion: string | null;

  @Column("numeric", { name: "latitud", nullable: true, precision: 9, scale: 6, transformer: numericTransformer })
  latitud: number | null;

  @Column("numeric", { name: "longitud", nullable: true, precision: 9, scale: 6, transformer: numericTransformer })
  longitud: number | null;

  /** Ej.: café, arroz, maíz */
  @Column("character varying", { name: "tipoproduccion", nullable: true, length: 100 })
  tipoproduccion: string | null;

  @Column("integer", { name: "idpropietario" })
  idpropietario: number;

  @Column("integer", { name: "idplan" })
  idplan: number;

  @Column("timestamp with time zone", { name: "planvencimiento", nullable: true })
  planvencimiento: Date | null;

  @Column("boolean", { name: "activo", default: () => "true" })
  activo: boolean;

  @ManyToOne(() => Plan)
  @JoinColumn([{ name: "idplan", referencedColumnName: "idplan" }])
  plan: Plan;

  @OneToMany(() => FincaUsuario, (fu) => fu.finca)
  miembros: FincaUsuario[];
}
