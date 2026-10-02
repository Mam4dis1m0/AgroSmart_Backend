import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("solicitud_contratacion", { schema: "public" })
export class SolicitudContratacion {
  @PrimaryGeneratedColumn({ type: "integer", name: "idsolicitud" })
  idsolicitud: number;

  @Column("integer", { name: "idfinca" })
  idfinca: number;

  @Column("integer", { name: "idperfil" })
  idperfil: number;

  @Column("integer", { name: "idadmin", nullable: true })
  idadmin: number | null;

  @Column("text", { name: "mensaje", nullable: true })
  mensaje: string | null;

  /** PENDIENTE | ACEPTADA | RECHAZADA | CANCELADA */
  @Column("character varying", { name: "estado", length: 20, default: () => "'PENDIENTE'" })
  estado: string;

  @Column("timestamp with time zone", { name: "respondida_at", nullable: true })
  respondidaAt: Date | null;
}
