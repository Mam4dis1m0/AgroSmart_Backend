// src/Modules/lotes/lotes.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { Lote } from '../../Entidades/entities/Lote';
import { CacheService } from '../../common/cache.service';
import { OfflineQueueService } from '../../common/offline-queue.service';
import { SyncService } from '../../common/sync.service';
import { BaseOfflineService } from '../../common/base-offline.service';
import { TenantContext } from '../../auth/tenant-context';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Injectable()
export class LotesService extends BaseOfflineService<Lote> {
  constructor(
    @InjectRepository(Lote) repo: Repository<Lote>,
    cache: CacheService,
    offlineQueue: OfflineQueueService,
    sync: SyncService,
  ) {
    super(repo, cache, offlineQueue, sync, 'lote', 'idlote');
  }

  findAll() {
    return this.findAllOffline(() =>
      this.repo.createQueryBuilder('lote')
        .leftJoinAndSelect('lote.cultivos', 'cultivo')
        .where('lote.idfinca = :f', { f: this.idfinca })
        .getMany()
    );
  }

  findOne(id: number) {
    return this.findOneOffline(id, () => this.repo.findOneBy(this.where({ idlote: id })));
  }

  async subirFoto(base64: string) {
    if (base64.length > 7_000_000) {
      throw new BadRequestException('La imagen supera el tamaño máximo (5 MB)');
    }
    const finca = TenantContext.requireFinca();
    const result = await cloudinary.uploader.upload(base64, {
      folder: `agrosmart/lotes/finca_${finca}`,
      transformation: [{ width: 1200, crop: 'limit' }],
    });
    return { imagenurl: result.secure_url };
  }

  create(data: Partial<Lote>) {
    return this.createOffline(data, () => this.repo.save(this.repo.create(this.withFinca(data))));
  }

  update(id: number, data: Partial<Lote>) {
    return this.updateOffline(id, data, () => this.updateEnFinca(id, data));
  }

  remove(id: number) {
    return this.removeOffline(id, () => this.deleteEnFinca(id));
  }
}
