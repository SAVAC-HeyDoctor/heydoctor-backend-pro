import { Injectable } from '@nestjs/common';
import { OpenAIService } from '../../common/services/openai.service';

@Injectable()
export class ClinicalIntelligenceService {
  constructor(private readonly openai: OpenAIService) {}

  async suggest(symptoms: string) {
    if (!this.openai.isAvailable) {
      return {
        data: {
          suggestions: [],
          possibleConditions: [],
          message: 'OpenAI API key not configured',
        },
      };
    }

    try {
      const prompt = `Given symptoms: "${symptoms}". Return JSON: { suggestions: [clinical action strings], possibleConditions: [{ code, name, likelihood }] }`;

      const response = await this.openai.complete(
        prompt,
        'You are a clinical intelligence assistant. Return only valid JSON.',
      );

      let result = {
        suggestions: [] as string[],
        possibleConditions: [] as Array<{
          code: string;
          name: string;
          likelihood: string;
        }>,
      };

      try {
        const parsed = JSON.parse(response);
        result = {
          suggestions: parsed.suggestions || [],
          possibleConditions: parsed.possibleConditions || [],
        };
      } catch {
        result.suggestions = response ? [response] : [];
      }

      return { data: result };
    } catch {
      return {
        data: {
          suggestions: [],
          possibleConditions: [],
        },
      };
    }
  }
}
