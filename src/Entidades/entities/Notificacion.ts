import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("notificacion_pkey", ["idnotificacion"], { unique: true })
@Entity("notificacion", { schema: "public" })
export class Notificacion {
  @PrimaryGeneratedColumn({ type: "integer", name: "idnotificacion" })
  idnotificacion: number;

  @Column("text", { name: "mensaje", nullable: true })
  mensaje: string | null;

  @Column("character varying", { name: "tipo", nullable: true, length: 50 })
  tipo: string | null;

  @Column("character varying", {
    name: "tabla_origen",
    nullable: true,
    length: 50,
  })
  tablaOrigen: string | null;

  @Column("integer", { name: "idregistro", nullable: true })
  idregistro: number | null;

  @Column("timestamp without time zone", {
    name: "fecha",
    nullable: true,
    default: () => "now()",
  })
  fecha: Date | null;

  @Column("boolean", { name: "leida", nullable: true, default: () => "false" })
  leida: boolean | null;
}
