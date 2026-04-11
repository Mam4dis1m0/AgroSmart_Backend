import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    // Carga el .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Conexión a Supabase
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [__dirname + '/**/*.entidad{.ts,.js}'],
      synchronize: false, // false porque ya tienes las tablas creadas
      ssl: { rejectUnauthorized: false }, // obligatorio en Supabase
    }),

    UsuariosModule,
  ],
})
export class AppModule {}