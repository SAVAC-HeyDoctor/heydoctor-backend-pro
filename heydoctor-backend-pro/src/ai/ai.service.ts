import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import type { GenerateAiDto } from './dto/generate-ai.dto';
import type { ClinicalSummaryResult } from './ai.types';

@Injectable()
export class AiService {
  private readonly client: OpenAI;
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly authorizationService: AuthorizationService,
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.client = new OpenAI({
      apiKey: apiKey || 'sk-not-configured',
    });
  }

  /**
   * Resumen clínico: solo campos persistidos en la consulta; validación multi-tenant vía {@link AuthorizationService}.
   */
  async generateClinicalSummaryForConsultation(
    consultationId: string,
    authUser: AuthenticatedUser,
  ): Promise<ClinicalSummaryResult> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);

    const consultation = await this.consultationsRepository.findOne({
      where: { id: consultationId, clinicId },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      consultation.clinicId,
      user,
    );

    this.logger.log('AI consultation-summary: using DB clinical fields', {
      event: 'ai_consultation_summary_start',
      consultationId,
      clinicId,
    });

    const dto: GenerateAiDto = {
      reason: consultation.reason,
      notes: consultation.notes ?? '',
      diagnosis: consultation.diagnosis ?? '',
      treatment: consultation.treatment ?? '',
    };
    return this.generateClinicalSummary(dto);
  }

  /**
   * Calls OpenAI once; returns parsed JSON only (no DB writes).
   * Expuesto para flujos internos (p. ej. {@link ConsultationsService}) que ya validaron contexto.
   */
  async generateClinicalSummary(
    dto: GenerateAiDto,
  ): Promise<ClinicalSummaryResult> {
    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
    const userBlock = this.buildUserContent(dto);

    let raw: string;
    try {
      const completion = await this.client.chat.completions.create({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userBlock },
        ],
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new BadGatewayException('Empty response from language model');
      }
      raw = content;
    } catch (err) {
      if (err instanceof BadGatewayException) {
        throw err;
      }
      throw new BadGatewayException(
        'Clinical assistant temporarily unavailable',
      );
    }

    return this.parseClinicalJson(raw);
  }

  private buildUserContent(dto: GenerateAiDto): string {
    const lines: string[] = [
      'Use only the following clinical fields (may be empty).',
      '',
    ];

    const age = dto.patientAge?.trim();
    const sex = dto.patientSex?.trim();
    if (age || sex) {
      lines.push('Patient demographics (optional; verify at point of care):');
      lines.push(`Age: ${age || 'not provided'}`);
      lines.push(`Sex / gender: ${sex || 'not provided'}`);
      lines.push('');
    }

    const prior = dto.priorNotesExcerpt?.trim();
    if (prior) {
      lines.push(
        'Recent documentation tail (last up to 300 characters; may overlap full notes):',
      );
      lines.push(prior);
      lines.push('');
    }

    lines.push(
      `Reason for visit / chief complaint:\n${dto.reason || '(none)'}`,
      '',
      `Clinical notes:\n${dto.notes || '(none)'}`,
      '',
      `Working diagnosis (clinician-entered, not verified by AI):\n${dto.diagnosis || '(none)'}`,
      '',
      `Treatment / plan documented:\n${dto.treatment || '(none)'}`,
    );

    return lines.join('\n');
  }

  private parseClinicalJson(raw: string): ClinicalSummaryResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new BadGatewayException('Model returned non-JSON output');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new BadGatewayException('Invalid AI response shape');
    }

    const o = parsed as Record<string, unknown>;
    const summary = o.summary;
    const suggestedDiagnosis = o.suggestedDiagnosis;
    const improvedNotes = o.improvedNotes;

    if (typeof summary !== 'string' || typeof improvedNotes !== 'string') {
      throw new BadGatewayException('Invalid AI response shape');
    }

    let diagnoses: string[];
    if (Array.isArray(suggestedDiagnosis)) {
      diagnoses = suggestedDiagnosis.filter(
        (x): x is string => typeof x === 'string',
      );
    } else if (typeof suggestedDiagnosis === 'string') {
      diagnoses = [suggestedDiagnosis];
    } else {
      diagnoses = [];
    }

    return { summary, suggestedDiagnosis: diagnoses, improvedNotes };
  }
}

const SYSTEM_PROMPT = `You are a clinical documentation assistant for licensed healthcare professionals. You are not a substitute for clinical judgment, examination, or diagnostic testing.

Rules:
- Output MUST be a single JSON object with exactly these keys: "summary" (string), "suggestedDiagnosis" (array of strings), "improvedNotes" (string). No markdown fences, no extra keys.
- "summary": concise professional narrative of the consultation context (chief complaint, relevant documented findings if any, and plan direction). Use neutral clinical language.
- "suggestedDiagnosis": 2–6 differential diagnoses or working hypotheses that could be considered in a clinical setting, ordered from more to less likely given ONLY the text provided. Each item must be phrased as a possibility (e.g. "Possible …", "Consider …", "Differential includes …"). Never state a definitive or certain diagnosis. If information is insufficient, return fewer items or a single item stating that further assessment is needed.
- "improvedNotes": polished clinical note text that preserves meaning, improves clarity and standard medical wording, and avoids claiming findings not present in the input. If input is empty, return a brief note that documentation is pending.

Safety:
- Do not invent patient demographics, vitals, labs, imaging, or exam findings not present in the input.
- Include a brief reminder in "summary" or "improvedNotes" that suggestions are non-binding and require clinician verification when appropriate.
- Use professional tone; no alarmist language.`;
