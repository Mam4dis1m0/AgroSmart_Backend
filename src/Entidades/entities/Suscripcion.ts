import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("suscripcion", { schema: "public" })
export class Suscripcion {
  @PrimaryGeneratedColumn({ type: "integer", name: "idsuscripcion" })
  idsuscripcion: number;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idplan" })
  idplan: number;

  /** ACTIVA | CANCELADA | VENCIDA */
  @Column("character varying", { name: "estado", length: 20, default: () => "'ACTIVA'" })
  estado: string;

  @Column("timestamp with time zone", { name: "fechainicio", default: () => "now()" })
  fechainicio: Date;

  @Column("timestamp with time zone", { name: "fechafin", nullable: true })
  fechafin: Date | null;

  @Column("boolean", { name: "renovacionautomatica", default: () => "true" })
  renovacionautomatica: boolean;

  @Column("integer", { name: "idpago", nullable: true })
  idpago: number | null;
}
