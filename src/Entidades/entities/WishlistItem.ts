import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("wishlist_item", { schema: "public" })
export class WishlistItem {
  @PrimaryGeneratedColumn({ type: "integer", name: "idwishlistitem" })
  idwishlistitem: number;

  @Column("integer", { name: "idusuario" })
  idusuario: number;

  @Column("integer", { name: "idlistado" })
  idlistado: number;
}
