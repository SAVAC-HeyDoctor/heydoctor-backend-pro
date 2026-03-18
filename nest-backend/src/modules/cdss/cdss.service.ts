import { Injectable } from '@nestjs/common';
import { OpenAIService } from '../../common/services/openai.service';

@Injectable()
export class CdssService {
  constructor(private readonly openai: OpenAIService) {}

  async evaluate(data: {
    patientId?: string;
    symptoms?: string[];
    vitals?: Record<string, number>;
    currentMedications?: string[];
    allergies?: string[];
  }) {
    if (!this.openai.isAvailable) {
      return {
        data: {
          recommendations: [],
          differentialDiagnosis: [],
          alerts: [],
          message: 'OpenAI API key not configured',
        },
      };
    }

    try {
      const prompt = `As a Clinical Decision Support System, analyze:
- Symptoms: ${(data.symptoms || []).join(', ') || 'None'}
- Vitals: ${JSON.stringify(data.vitals || {})}
- Current medications: ${(data.currentMedications || []).join(', ') || 'None'}
- Allergies: ${(data.allergies || []).join(', ') || 'None'}

Return a JSON object with: recommendations (array of strings), differentialDiagnosis (array of {code, description}), alerts (array of strings).`;

      const response = await this.openai.complete(
        prompt,
        'You are a CDSS. Return only valid JSON, no markdown.',
      );

      let result = {
        recommendations: [] as string[],
        differentialDiagnosis: [] as Array<{ code: string; description: string }>,
        alerts: [] as string[],
      };

      try {
        const parsed = JSON.parse(response);
        result = {
          recommendations: parsed.recommendations || [],
          differentialDiagnosis: parsed.differentialDiagnosis || [],
          alerts: parsed.alerts || [],
        };
      } catch {
        // keep defaults
      }

      return { data: result };
    } catch {
      return {
        data: {
          recommendations: [],
          differentialDiagnosis: [],
          alerts: [],
        },
      };
    }
  }
}
