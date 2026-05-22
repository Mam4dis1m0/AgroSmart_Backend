// src/common/offline-queue.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface QueuedOperation {
  id: string;
  entity: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: any;
  timestamp: string;
}

@Injectable()
export class OfflineQueueService {
  private readonly logger = new Logger(OfflineQueueService.name);
  private readonly queueFile = path.join(process.cwd(), '.cache', 'pending-queue.json');

  private load(): QueuedOperation[] {
    if (!fs.existsSync(this.queueFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.queueFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  private save(queue: QueuedOperation[]) {
    fs.writeFileSync(this.queueFile, JSON.stringify(queue, null, 2));
  }

  add(entity: string, operation: QueuedOperation['operation'], data: any): QueuedOperation {
    const queue = this.load();
    const op: QueuedOperation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entity,
      operation,
      data,
      timestamp: new Date().toISOString(),
    };
    queue.push(op);
    this.save(queue);
    this.logger.log(`📥 Encolado: ${operation} en ${entity} — pendientes: ${queue.length}`);
    return op;
  }

  getAll(): QueuedOperation[] {
    return this.load();
  }

  remove(id: string) {
    const queue = this.load().filter(op => op.id !== id);
    this.save(queue);
  }

  count(): number {
    return this.load().length;
  }
}