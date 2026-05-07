import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlag } from './feature-flag.entity';
import { CreateFeatureFlagDto, PatchFeatureFlagDto } from './dto/growth.dto';
import { rolloutBucketPercent } from './rollout.util';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly repo: Repository<FeatureFlag>,
  ) {}

  async list(): Promise<FeatureFlag[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  async create(dto: CreateFeatureFlagDto): Promise<FeatureFlag> {
    const existing = await this.repo.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Feature flag «${dto.key}» ya existe`);
    }
    const row = this.repo.create({
      key: dto.key,
      enabled: dto.enabled ?? true,
      rolloutPercentage: dto.rolloutPercentage ?? 100,
      forcedOnUserIds: [],
      forcedOffUserIds: [],
    });
    return this.repo.save(row);
  }

  async patchByKey(
    key: string,
    dto: PatchFeatureFlagDto,
  ): Promise<FeatureFlag> {
    const row = await this.repo.findOne({ where: { key } });
    if (!row) {
      throw new NotFoundException(`Feature flag «${key}» no existe`);
    }
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.rolloutPercentage !== undefined) {
      row.rolloutPercentage = Math.min(100, Math.max(0, dto.rolloutPercentage));
    }
    if (dto.forcedOnUserIds !== undefined)
      row.forcedOnUserIds = [...dto.forcedOnUserIds];
    if (dto.forcedOffUserIds !== undefined)
      row.forcedOffUserIds = [...dto.forcedOffUserIds];
    return this.repo.save(row);
  }

  /**
   * rollout % + listas forzadas; usuario anónimo sólo ve encendido si rollout 100%.
   */
  async isFeatureEnabled(userId: string | null, key: string): Promise<boolean> {
    const row = await this.repo.findOne({ where: { key } });
    return this.rowEnabledForUser(row, userId);
  }

  rowEnabledForUser(row: FeatureFlag | null, userId: string | null): boolean {
    if (!row || !row.enabled) return false;
    if (!userId) return row.rolloutPercentage >= 100;
    if (row.forcedOffUserIds?.includes(userId)) return false;
    if (row.forcedOnUserIds?.includes(userId)) return true;
    const b = rolloutBucketPercent(userId);
    return b < row.rolloutPercentage;
  }

  async evaluatedForUser(
    userId: string | null,
  ): Promise<Record<string, boolean>> {
    const rows = await this.repo.find({ order: { key: 'ASC' } });
    const out: Record<string, boolean> = {};
    for (const row of rows) {
      out[row.key] = this.rowEnabledForUser(row, userId);
    }
    return out;
  }
}
