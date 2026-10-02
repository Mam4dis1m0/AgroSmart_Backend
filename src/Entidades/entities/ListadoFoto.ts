import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Listado } from "./Listado";

@Entity("listado_foto", { schema: "public" })
export class ListadoFoto {
  @PrimaryGeneratedColumn({ type: "integer", name: "idfoto" })
  idfoto: number;

  @Column("integer", { name: "idlistado" })
  idlistado: number;

  @Column("text", { name: "url" })
  url: string;

  @Column("integer", { name: "orden", default: () => "0" })
  orden: number;

  @ManyToOne(() => Listado, (l) => l.fotos, { onDelete: "CASCADE" })
  @JoinColumn([{ name: "idlistado", referencedColumnName: "idlistado" }])
  listado: Listado;
}
