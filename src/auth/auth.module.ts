// src/auth/auth.module.ts
//
// Seguridad transversal. Es @Global: TokenService, PlanService y SesionService se
// inyectan en cualquier módulo sin importarlo. Registra los dos guards globales:
//   1) AuthGuard → JWT + rol + finca activa
//   2) PlanGuard → funciones Premium (@RequiereFuncion)

import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { PlanGuard } from './plan.guard';
import { PlanService } from './plan.service';
import { SesionService } from './sesion.service';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [
    TokenService,
    SesionService,
    PlanService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PlanGuard },
  ],
  exports: [TokenService, SesionService, PlanService],
})
export class AuthModule {}
