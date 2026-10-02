import { Column, Entity, PrimaryColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

/** Perfil del Comprador Externo del Marketplace (registro simple, RF-28). */
@Entity("comprador_perfil", { schema: "public" })
export class CompradorPerfil {
  @PrimaryColumn("integer", { name: "idusuario" })
  idusuario: number;

  @Column("character varying", { name: "ubicacion", nullable: true, length: 255 })
  ubicacion: string | null;

  @Column("numeric", { name: "latitud", nullable: true, precision: 9, scale: 6, transformer: numericTransformer })
  latitud: number | null;

  @Column("numeric", { name: "longitud", nullable: true, precision: 9, scale: 6, transformer: numericTransformer })
  longitud: number | null;

  @Column("integer", { name: "radioalertaskm", default: () => "50" })
  radioalertaskm: number;

  @Column("boolean", { name: "notificaciones", default: () => "true" })
  notificaciones: boolean;
}
