import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

@Entity("carrito_item", { schema: "public" })
export class CarritoItem {
  @PrimaryGeneratedColumn({ type: "integer", name: "idcarritoitem" })
  idcarritoitem: number;

  @Column("integer", { name: "idusuario" })
  idusuario: number;

  @Column("integer", { name: "idlistado" })
  idlistado: number;

  @Column("numeric", { name: "cantidad", precision: 12, scale: 2, transformer: numericTransformer })
  cantidad: number;
}
