import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Usuario } from './Usuario.entidad';

@Entity('verificaciones')
export class Verificacion {
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

  @ManyToOne(() => Usuario, (usuario) => usuario.verificaciones, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;
}