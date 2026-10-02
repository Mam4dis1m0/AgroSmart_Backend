import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Administrador } from "./Administrador";
import { Lote } from "./Lote";
import { Tarea } from "./Tarea";

@Index("cultivo_pkey", ["idcultivo"], { unique: true })
@Entity("cultivo", { schema: "public" })
export class Cultivo {
  @PrimaryGeneratedColumn({ type: "integer", name: "idcultivo" })
  idcultivo: number;

  /** Tenant (finca dueña del dato) */
  @Column("integer", { name: "idfinca" })
  idfinca: number;

  /** CU-05: tipo de cultivo (maíz, café, palma...) */
  @Column("character varying", { name: "tipo", nullable: true, length: 100 })
  tipo: string | null;

  @Column("boolean", { name: "activo", default: () => "true" })
  activo: boolean;

  @Column("character varying", {
    name: "nombrelote",
    nullable: true,
    length: 100,
  })
  nombrelote: string | null;

  @Column("date", { name: "fechasiembra", nullable: true })
  fechasiembra: string | null;

  @Column("date", { name: "fechacosechaestimada", nullable: true })
  fechacosechaestimada: string | null;

  @Column("text", { name: "alertan8n", nullable: true })
  alertan8n: string | null;

  @ManyToOne(() => Administrador, (administrador) => administrador.cultivos)
  @JoinColumn([
    { name: "idadminsupervisor", referencedColumnName: "idusuario" },
  ])
  idadminsupervisor: Administrador;

  @ManyToOne(() => Lote, (lote) => lote.cultivos)
  @JoinColumn([{ name: "idlote", referencedColumnName: "idlote" }])
  idlote: Lote;

  @OneToMany(() => Tarea, (tarea) => tarea.idcultivo)
  tareas: Tarea[];
}
