import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiInsight,
  Patient,
  Consultation,
  ClinicalRecord,
  LabOrder,
  Prescription,
} from '../../entities';
import { OpenAIService } from '../../common/services/openai.service';
import {
  PredictedCondition,
  RiskScore,
  ClinicalPattern,
  RecommendedAction,
} from '../../entities/ai-insight.entity';
import { GenerateInsightsDto } from './dto/generate-insights.dto';

interface AiInsightsResponse {
  predicted_conditions: PredictedCondition[];
  risk_scores: RiskScore[];
  clinical_patterns: ClinicalPattern[];
  recommended_actions: RecommendedAction[];
}

@Injectable()
export class AiInsightsService {
  constructor(
    @InjectRepository(AiInsight)
    private readonly aiInsightRepo: Repository<AiInsight>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Consultation)
    private readonly consultationRepo: Repository<Consultation>,
    @InjectRepository(ClinicalRecord)
    private readonly clinicalRecordRepo: Repository<ClinicalRecord>,
    @InjectRepository(LabOrder)
    private readonly labOrderRepo: Repository<LabOrder>,
    @InjectRepository(Prescription)
    private readonly prescriptionRepo: Repository<Prescription>,
    private readonly openai: OpenAIService,
  ) {}

  async getByPatient(
    patientId: string,
    clinicId?: string,
    limit = 10,
  ): Promise<{ data: AiInsight[] }> {
    const patient = await this.patientRepo.findOne({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const qb = this.aiInsightRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.patient', 'patient')
      .leftJoinAndSelect('a.consultation', 'consultation')
      .where('a.patientId = :patientId', { patientId })
      .orderBy('a.createdAt', 'DESC')
      .take(limit);

    if (clinicId) {
      qb.andWhere('(a.clinicId = :clinicId OR a.clinicId IS NULL)', {
        clinicId,
      });
    }

    const items = await qb.getMany();
    return { data: items };
  }

  async generate(
    dto: GenerateInsightsDto,
    clinicId?: string,
  ): Promise<{ data: AiInsight }> {
    const patient = await this.patientRepo.findOne({
      where: { id: dto.patientId },
      relations: ['clinical_record'],
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const clinicalContext = await this.buildClinicalContext(
      dto.patientId,
      dto.consultationId,
      clinicId ?? dto.clinicId ?? patient.clinicId ?? undefined,
    );

    const symptomsInput =
      (dto.symptoms ??
        (Array.isArray(dto.symptomsList) ? dto.symptomsList.join(', ') : '')) ||
      clinicalContext.symptomsSummary ||
      'No symptoms provided';

    const fullContext = [
      clinicalContext.recordsSummary,
      clinicalContext.labSummary,
      clinicalContext.prescriptionsSummary,
      clinicalContext.diagnosesSummary,
      dto.context,
    ]
      .filter(Boolean)
      .join('\n\n');

    let result: AiInsightsResponse = {
      predicted_conditions: [],
      risk_scores: [],
      clinical_patterns: [],
      recommended_actions: [],
    };

    if (this.openai.isAvailable) {
      try {
        const systemPrompt = `You are a clinical intelligence assistant for doctors. Analyze the patient data and return ONLY a valid JSON object with these exact keys (no markdown, no extra text):
- predicted_conditions: array of { condition: string, code?: string, probability?: number (0-1), timeframe?: string }
- risk_scores: array of { condition: string, score: number (0-100), level: "low"|"medium"|"high", factors?: string[] }
- clinical_patterns: array of { pattern: string, description?: string, relevance?: string, evidence?: string[] }
- recommended_actions: array of { action: string, priority?: "low"|"medium"|"high"|"urgent", category?: string, rationale?: string }

Be concise. Use ICD-10 codes when possible for conditions. Prioritize actionable insights.`;

        const userPrompt = `Patient: ${patient.firstname} ${patient.lastname}, ${patient.birth_date ? `DOB: ${patient.birth_date}` : ''}

Symptoms/Chief complaint: ${symptomsInput}

Clinical context:
${fullContext || 'No additional context.'}

Return the JSON with clinical insights.`;

        const response = await this.openai.complete(userPrompt, systemPrompt);
        const parsed = this.openai.parseJsonResponse<AiInsightsResponse>(
          response,
        );
        if (parsed) {
          result = {
            predicted_conditions: Array.isArray(parsed.predicted_conditions)
              ? parsed.predicted_conditions
              : [],
            risk_scores: Array.isArray(parsed.risk_scores)
              ? parsed.risk_scores
              : [],
            clinical_patterns: Array.isArray(parsed.clinical_patterns)
              ? parsed.clinical_patterns
              : [],
            recommended_actions: Array.isArray(parsed.recommended_actions)
              ? parsed.recommended_actions
              : [],
          };
        }
      } catch {
        // Fallback to empty - AI unavailable or failed
      }
    }

    const insight = this.aiInsightRepo.create({
      patientId: dto.patientId,
      consultationId: dto.consultationId ?? null,
      clinicId: clinicId ?? dto.clinicId ?? patient.clinicId ?? null,
      predicted_conditions: result.predicted_conditions,
      risk_scores: result.risk_scores,
      clinical_patterns: result.clinical_patterns,
      recommended_actions: result.recommended_actions,
    });

    const saved = await this.aiInsightRepo.save(insight);
    return { data: saved };
  }

  private async buildClinicalContext(
    patientId: string,
    consultationId?: string,
    clinicId?: string,
  ): Promise<{
    symptomsSummary: string;
    recordsSummary: string;
    labSummary: string;
    prescriptionsSummary: string;
    diagnosesSummary: string;
  }> {
    const recordWhere = clinicId
      ? { patientId, clinicId }
      : { patientId };
    const labWhere = clinicId ? { patientId, clinicId } : { patientId };
    const rxWhere = clinicId ? { patientId, clinicId } : { patientId };

    const [records, labOrders, prescriptions, consultation] = await Promise.all(
      [
        this.clinicalRecordRepo.find({
          where: recordWhere,
          relations: ['diagnostics'],
          order: { consultationDate: 'DESC' },
          take: 5,
        }),
        this.labOrderRepo.find({
          where: labWhere,
          order: { createdAt: 'DESC' },
          take: 5,
        }),
        this.prescriptionRepo.find({
          where: rxWhere,
          order: { createdAt: 'DESC' },
          take: 5,
        }),
        consultationId
          ? this.consultationRepo.findOne({
              where: { id: consultationId },
              relations: ['diagnostic'],
            })
          : null,
      ],
    );

    const symptomsFromRecords = records
      .map((r) => r.chiefComplaint || r.clinicalNote)
      .filter(Boolean)
      .join('; ');
    const symptomsFromConsultation =
      consultation?.appointment_reason ?? consultation?.notes ?? '';

    const diagnosesFromRecords = records.flatMap((r) =>
      (r.diagnostics || []).map((d) => d.diagnosis_details ?? ''),
    );
    const diagnosesFromConsultation = consultation?.diagnostic
      ? [consultation.diagnostic.diagnosis_details ?? '']
      : [];

    return {
      symptomsSummary: [symptomsFromRecords, symptomsFromConsultation]
        .filter(Boolean)
        .join('. ') || 'Not documented',
      recordsSummary: records.length
        ? `Recent records: ${records.length} clinical records. ${symptomsFromRecords || ''}`
        : '',
      labSummary: labOrders.length
        ? `Recent lab orders: ${labOrders.map((l) => l.lab_tests?.join(', ') || 'tests').join('; ')}`
        : '',
      prescriptionsSummary: prescriptions.length
        ? `Recent prescriptions: ${prescriptions.map((p) => p.medications?.map((m) => m.name).join(', ') || 'meds').join('; ')}`
        : '',
      diagnosesSummary: [...diagnosesFromRecords, ...diagnosesFromConsultation]
        .filter(Boolean).length
        ? `Prior diagnoses: ${[...new Set([...diagnosesFromRecords, ...diagnosesFromConsultation].filter(Boolean))].join(', ')}`
        : '',
    };
  }
}
