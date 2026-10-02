import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("mensaje_interno", { schema: "public" })
export class MensajeInterno {
  @PrimaryGeneratedColumn({ type: "bigint", name: "idmensaje" })
  idmensaje: string;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idremitente" })
  idremitente: number;

  /** null = toda la finca */
  @Column("integer", { name: "iddestinatario", nullable: true })
  iddestinatario: number | null;

  @Column("text", { name: "contenido" })
  contenido: string;

  /** PENDIENTE | ENVIADO | LEIDO */
  @Column("character varying", { name: "estado", length: 10, default: () => "'ENVIADO'" })
  estado: string;

  @Column("boolean", { name: "creadooffline", default: () => "false" })
  creadooffline: boolean;

  @Column({ type: "timestamp with time zone", name: "created_at", default: () => "now()", update: false })
  createdAt: Date;

  @Column("timestamp with time zone", { name: "leido_at", nullable: true })
  leidoAt: Date | null;
}
