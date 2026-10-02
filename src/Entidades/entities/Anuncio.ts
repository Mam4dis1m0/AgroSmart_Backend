import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("anuncio", { schema: "public" })
export class Anuncio {
  @PrimaryGeneratedColumn({ type: "integer", name: "idanuncio" })
  idanuncio: number;

  @Column("integer", { name: "idanunciante" })
  idanunciante: number;

  @Column("character varying", { name: "titulo", length: 150 })
  titulo: string;

  @Column("text", { name: "descripcion", nullable: true })
  descripcion: string | null;

  @Column("text", { name: "imagenurl", nullable: true })
  imagenurl: string | null;

  @Column("text", { name: "urldestino", nullable: true })
  urldestino: string | null;

  /** HOME | INVENTARIO | MARKETPLACE */
  @Column("character varying", { name: "espacio", length: 30, default: () => "'HOME'" })
  espacio: string;

  @Column("boolean", { name: "activo", default: () => "true" })
  activo: boolean;

  @Column("date", { name: "fechainicio", nullable: true })
  fechainicio: string | null;

  @Column("date", { name: "fechafin", nullable: true })
  fechafin: string | null;
}
