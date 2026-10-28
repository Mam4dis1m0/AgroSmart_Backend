import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers";

/** Insumo que normalmente consume una labor: un insumo concreto de la finca o solo su tipo. */
@Index("plantilla_labor_insumo_pkey", ["idplantillainsumo"], { unique: true })
@Entity("plantilla_labor_insumo", { schema: "public" })
export class PlantillaLaborInsumo {
  @PrimaryGeneratedColumn({ type: "integer", name: "idplantillainsumo" })
  idplantillainsumo: number;

  @Column("integer", { name: "idplantilla" })
  idplantilla: number;

  @Column("integer", { name: "idinsumo", nullable: true })
  idinsumo: number | null;

  @Column("character varying", { name: "tipoinsumo", nullable: true, length: 100 })
  tipoinsumo: string | null;

  @Column("numeric", { name: "cantidadsugerida", nullable: true, precision: 10, scale: 2, transformer: numericTransformer })
  cantidadsugerida: number | null;

  @Column("character varying", { name: "unidad", nullable: true, length: 30 })
  unidad: string | null;
}
