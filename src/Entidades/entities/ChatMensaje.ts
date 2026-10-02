import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("chat_mensaje", { schema: "public" })
export class ChatMensaje {
  @PrimaryGeneratedColumn({ type: "bigint", name: "idmensaje" })
  idmensaje: string;

  @Column("integer", { name: "idconversacion" })
  idconversacion: number;

  /** user | assistant | system */
  @Column("character varying", { name: "rol", length: 10 })
  rol: string;

  @Column("text", { name: "contenido" })
  contenido: string;

  @Column({ type: "timestamp with time zone", name: "created_at", default: () => "now()", update: false })
  createdAt: Date;
}
