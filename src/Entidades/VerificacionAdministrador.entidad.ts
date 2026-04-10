import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Administrador } from './Administrador.entidad';

@Entity('verificaciones_administradores')
export class VerificacionAdministrador {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, unique: true })
  token: string;

  @Column({ default: false })
  usado: boolean;

  @CreateDateColumn()
  fechaCreacion: Date;

  @Column({ type: 'timestamp', nullable: true })
  fechaUso: Date | null;

  @ManyToOne(() => Administrador, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'administrador_id' })
  administrador: Administrador;
}
