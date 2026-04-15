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
