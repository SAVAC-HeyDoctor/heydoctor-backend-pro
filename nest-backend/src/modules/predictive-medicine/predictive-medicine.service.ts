import { Injectable } from '@nestjs/common';
import { OpenAIService } from '../../common/services/openai.service';

@Injectable()
export class PredictiveMedicineService {
  constructor(private readonly openai: OpenAIService) {}

  async assessRisk(data: {
    patientId?: string;
    conditions?: string[];
    vitals?: Record<string, number>;
    familyHistory?: string[];
    lifestyleFactors?: string[];
  }) {
    if (!this.openai.isAvailable) {
      return {
        data: {
          risks: [],
          recommendations: [],
          message: 'OpenAI API key not configured',
        },
      };
    }

    try {
      const prompt = `Assess predictive health risks based on:
- Conditions: ${(data.conditions || []).join(', ') || 'None'}
- Vitals: ${JSON.stringify(data.vitals || {})}
- Family history: ${(data.familyHistory || []).join(', ') || 'None'}
- Lifestyle factors: ${(data.lifestyleFactors || []).join(', ') || 'None'}

Return JSON: { risks: [{ condition, level, probability, description }], recommendations: [strings] }`;

      const response = await this.openai.complete(
        prompt,
        'You are a predictive medicine AI. Return only valid JSON.',
      );

      let result = {
        risks: [] as Array<{
          condition: string;
          level: string;
          probability: number;
          description: string;
        }>,
        recommendations: [] as string[],
      };

      try {
        const parsed = JSON.parse(response);
        result = {
          risks: parsed.risks || [],
          recommendations: parsed.recommendations || [],
        };
      } catch {
        // keep defaults
      }

      return { data: result };
    } catch {
      return {
        data: {
          risks: [],
          recommendations: [],
        },
      };
    }
  }
}
