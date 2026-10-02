import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

@Entity("perfil_talento", { schema: "public" })
export class PerfilTalento {
  @PrimaryGeneratedColumn({ type: "integer", name: "idperfil" })
  idperfil: number;

  @Column("integer", { name: "idusuario", unique: true })
  idusuario: number;

  @Column("character varying", { name: "especialidad", length: 100 })
  especialidad: string;

  @Column("text", { name: "descripcion", nullable: true })
  descripcion: string | null;

  @Column("integer", { name: "experienciaanios", nullable: true })
  experienciaanios: number | null;

  @Column("numeric", { name: "tarifahora", nullable: true, precision: 10, scale: 2, transformer: numericTransformer })
  tarifahora: number | null;

  @Column("character varying", { name: "ubicacion", nullable: true, length: 255 })
  ubicacion: string | null;

  @Column("boolean", { name: "disponible", default: () => "true" })
  disponible: boolean;
}
