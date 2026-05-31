// src/common/common.module.ts
import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheService } from './cache.service';
import { OfflineQueueService } from './offline-queue.service';
import { SyncService } from './sync.service';
import { MailModule } from '../mail/mail.module';   // ← AGREGAR

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), MailModule,],  // ← AGREGAR MailModule
  providers: [CacheService, OfflineQueueService, SyncService],
  exports: [CacheService, OfflineQueueService, SyncService],
})
export class CommonModule {}