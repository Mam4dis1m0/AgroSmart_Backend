import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("auditoria_pkey", ["idauditoria"], { unique: true })
@Entity("auditoria", { schema: "public" })
export class Auditoria {
  @PrimaryGeneratedColumn({ type: "integer", name: "idauditoria" })
  idauditoria: number;

  /** Finca donde ocurrió la acción (null = evento global / sin finca). */
  @Column("integer", { name: "idfinca", nullable: true })
  idfinca: number | null;

  /** Usuario responsable de la acción (RNF-07). */
  @Column("integer", { name: "idusuario", nullable: true })
  idusuario: number | null;

  @Column("character varying", {
    name: "tabla_nombre",
    nullable: true,
    length: 50,
  })
  tablaNombre: string | null;

  @Column("character varying", {
    name: "operacion",
    nullable: true,
    length: 10,
  })
  operacion: string | null;

  @Column("integer", { name: "idregistro", nullable: true })
  idregistro: number | null;

  @Column("text", { name: "descripcion", nullable: true })
  descripcion: string | null;

  @Column("timestamp without time zone", {
    name: "fecha",
    nullable: true,
    default: () => "now()",
  })
  fecha: Date | null;
}
