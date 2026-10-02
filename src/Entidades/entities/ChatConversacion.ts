import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("chat_conversacion", { schema: "public" })
export class ChatConversacion {
  @PrimaryGeneratedColumn({ type: "integer", name: "idconversacion" })
  idconversacion: number;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idusuario" })
  idusuario: number;

  @Column("character varying", { name: "titulo", nullable: true, length: 150 })
  titulo: string | null;
}
