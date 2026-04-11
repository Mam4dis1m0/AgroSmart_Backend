import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Verificacion } from './Verificacion.entidad';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  primerNombre: string;

  @Column({ length: 100, nullable: true })
  segundoNombre: string;

  @Column({ length: 100 })
  primerApellido: string;

  @Column({ length: 100, nullable: true })
  segundoApellido: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 255 })
  contrasena: string;

  @Column({ length: 20, nullable: true })
  telefono: string;

  // ✅ Esto es lo que faltaba
  @OneToMany(() => Verificacion, (v) => v.usuario)
  verificaciones: Verificacion[];

  @CreateDateColumn()
  createdAt: Date;
}