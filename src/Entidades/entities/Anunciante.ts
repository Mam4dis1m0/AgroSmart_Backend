import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("anunciante", { schema: "public" })
export class Anunciante {
  @PrimaryGeneratedColumn({ type: "integer", name: "idanunciante" })
  idanunciante: number;

  @Column("character varying", { name: "nombre", length: 150 })
  nombre: string;

  @Column("character varying", { name: "contacto", nullable: true, length: 150 })
  contacto: string | null;

  @Column("boolean", { name: "activo", default: () => "true" })
  activo: boolean;
}
