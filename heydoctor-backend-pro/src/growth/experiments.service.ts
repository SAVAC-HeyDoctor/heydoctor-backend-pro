import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GrowthExperiment } from './experiment.entity';
import { CreateExperimentDto, PatchExperimentDto } from './dto/growth.dto';
import { rolloutBucketPercent } from './rollout.util';

@Injectable()
export class ExperimentsService {
  constructor(
    @InjectRepository(GrowthExperiment)
    private readonly repo: Repository<GrowthExperiment>,
  ) {}

  async list(): Promise<GrowthExperiment[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  async create(dto: CreateExperimentDto): Promise<GrowthExperiment> {
    const existing = await this.repo.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Experiment «${dto.key}» ya existe`);
    }
    const variants = dto.variants?.length ? [...dto.variants] : ['A', 'B'];
    const trafficSplit =
      dto.trafficSplit && Object.keys(dto.trafficSplit).length
        ? { ...dto.trafficSplit }
        : (Object.fromEntries(
            variants.map((v) => [v, 100 / variants.length]),
          ) as Record<string, number>);
    const row = this.repo.create({
      key: dto.key,
      enabled: dto.enabled ?? true,
      variants,
      trafficSplit,
    });
    return this.repo.save(row);
  }

  async patchByKey(
    key: string,
    dto: PatchExperimentDto,
  ): Promise<GrowthExperiment> {
    const row = await this.repo.findOne({ where: { key } });
    if (!row) throw new NotFoundException(`Experiment «${key}» no existe`);
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.variants !== undefined && dto.variants.length > 0) {
      row.variants = [...dto.variants];
    }
    if (dto.trafficSplit !== undefined) {
      row.trafficSplit = { ...dto.trafficSplit };
    }
    return this.repo.save(row);
  }

  getVariantStable(
    userId: string | null,
    row: GrowthExperiment | null,
  ): string | null {
    if (!row || !row.enabled) return null;
    const variants = row.variants?.length ? row.variants : ['A', 'B'];
    if (!userId) return variants[0] ?? null;

    const weights = variants.map((v) =>
      Math.max(0, Number(row.trafficSplit?.[String(v)] ?? 0)),
    );
    let sum = weights.reduce((a, w) => a + w, 0);
    if (sum <= 0) sum = variants.length || 1;
    const norm = variants.map((v, i) => weights[i] / sum);
    const bucket = rolloutBucketPercent(`${userId}#${row.key}`);
    /** bucket en [0,99]; acumula en una escala 0..99 */
    let acc = 0;
    const scale = 100;
    for (let i = 0; i < variants.length; i++) {
      acc += norm[i] * scale;
      if (bucket < acc) return variants[i] ?? null;
    }
    return variants[variants.length - 1] ?? null;
  }

  async getVariant(
    userId: string | null,
    experimentKey: string,
  ): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key: experimentKey } });
    return this.getVariantStable(userId, row);
  }

  async assignmentsForUser(
    userId: string | null,
  ): Promise<Record<string, string | null>> {
    const rows = await this.repo.find({ order: { key: 'ASC' } });
    const out: Record<string, string | null> = {};
    for (const row of rows) {
      out[row.key] = this.getVariantStable(userId, row);
    }
    return out;
  }
}
