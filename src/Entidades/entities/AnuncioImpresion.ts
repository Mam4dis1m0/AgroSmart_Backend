import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("anuncio_impresion", { schema: "public" })
export class AnuncioImpresion {
  @PrimaryGeneratedColumn({ type: "bigint", name: "idimpresion" })
  idimpresion: string;

  @Column("integer", { name: "idanuncio" })
  idanuncio: number;

  @Column("integer", { name: "idusuario", nullable: true })
  idusuario: number | null;

  @Column("integer", { name: "idfinca", nullable: true })
  idfinca: number | null;

  @Column({ type: "timestamp with time zone", name: "created_at", default: () => "now()", update: false })
  createdAt: Date;
}
