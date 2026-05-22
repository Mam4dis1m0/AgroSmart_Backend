// src/common/cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly cacheDir = path.join(process.cwd(), '.cache');

  constructor() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      this.logger.log(`📁 Carpeta de caché creada en ${this.cacheDir}`);
    }
  }

  set(key: string, data: any) {
    const file = path.join(this.cacheDir, `${this.sanitize(key)}.json`);
    fs.writeFileSync(file, JSON.stringify({ data, savedAt: new Date().toISOString() }, null, 2));
  }

  get<T>(key: string): T | null {
    const file = path.join(this.cacheDir, `${this.sanitize(key)}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return raw.data as T;
    } catch {
      return null;
    }
  }

  delete(key: string) {
    const file = path.join(this.cacheDir, `${this.sanitize(key)}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  has(key: string): boolean {
    return fs.existsSync(path.join(this.cacheDir, `${this.sanitize(key)}.json`));
  }

  // Evita caracteres inválidos en nombres de archivo
  private sanitize(key: string): string {
    return key.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }
}