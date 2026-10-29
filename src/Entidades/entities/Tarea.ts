import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AsignacionTarea } from "./AsignacionTarea";
import { DetalleTarea } from "./DetalleTarea";
import { Administrador } from "./Administrador";
import { Cultivo } from "./Cultivo";

const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v !== null ? parseFloat(v) : null),
};

@Index("tarea_pkey", ["idtarea"], { unique: true })
@Entity("tarea", { schema: "public" })
export class Tarea {
  @PrimaryGeneratedColumn({ type: "integer", name: "idtarea" })
  idtarea: number;

  /** Tenant (finca dueña del dato) */
  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("character varying", {
    name: "tipoactividad",
    nullable: true,
    length: 50,
  })
  tipoactividad: string | null;

  @Column("date", { name: "fechaprogramada", nullable: true })
  fechaprogramada: string | null;

  @Column("numeric", {
    name: "tiempototaltarea",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  tiempototaltarea: number | null;  // ✅

  @Column("character varying", { name: "estado", nullable: true, length: 50 })
  estado: string | null;

  @Column("character varying", {
    name: "esrecurrente",
    nullable: true,
    length: 10,
  })
  esrecurrente: string | null;

  @Column("integer", { name: "frecuenciadias", nullable: true })
  frecuenciadias: number | null;

  @Column("numeric", {
    name: "costototal",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  costototal: number | null;  // ✅

  @Column("numeric", {
    name: "costotransporte",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  costotransporte: number | null;  // ✅

  @Column("jsonb", { name: "cosecha", nullable: true })
  cosecha: object | null;

  /** Plantilla de labor de la que salió (null si se creó a mano). */
  @Column("integer", { name: "idplantilla", nullable: true })
  idplantilla: number | null;

  /** Primera tarea de una cadena recurrente: evita duplicar ocurrencias. */
  @Column("integer", { name: "idtareaorigen", nullable: true })
  idtareaorigen: number | null;

  @Column("character varying", { name: "prioridad", length: 10, default: () => "'Media'" })
  prioridad: string;

  @Column("timestamp without time zone", { name: "fechainicio", nullable: true })
  fechainicio: Date | null;

  @Column("timestamp without time zone", { name: "fechafin", nullable: true })
  fechafin: Date | null;

  @Column("numeric", {
    name: "horasestimadas",
    nullable: true,
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  horasestimadas: number | null;

  /** Costo real al completar: insumos + mano de obra + transporte. */
  @Column("numeric", {
    name: "costoreal",
    nullable: true,
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  costoreal: number | null;

  /** Personas que necesita en su lote: personas por hectárea × hectáreas (null en tareas manuales). */
  @Column("integer", { name: "personasnecesarias", nullable: true })
  personasnecesarias: number | null;

  @Column("boolean", { name: "generadaauto", default: () => "false" })
  generadaauto: boolean;

  @Column("character varying", { name: "etapa", nullable: true, length: 50 })
  etapa: string | null;

  @OneToMany(() => AsignacionTarea, (asignacionTarea) => asignacionTarea.idtarea)
  asignacionTareas: AsignacionTarea[];

  @OneToMany(() => DetalleTarea, (detalleTarea) => detalleTarea.idtarea)
  detalleTareas: DetalleTarea[];

  @ManyToOne(() => Administrador, (administrador) => administrador.tareas)
  @JoinColumn([{ name: "idadmincreador", referencedColumnName: "idusuario" }])
  idadmincreador: Administrador;

  @ManyToOne(() => Cultivo, (cultivo) => cultivo.tareas)
  @JoinColumn([{ name: "idcultivo", referencedColumnName: "idcultivo" }])
  idcultivo: Cultivo;
}