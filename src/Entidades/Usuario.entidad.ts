import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;
}
