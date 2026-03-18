import { Injectable } from '@nestjs/common';
import { OpenAIService } from '../../common/services/openai.service';

@Injectable()
export class CopilotService {
  constructor(private readonly openai: OpenAIService) {}

  async getSuggestions(consultationId: string) {
    if (!this.openai.isAvailable) {
      return {
        data: {
          suggestions: [],
          message: 'OpenAI API key not configured',
        },
      };
    }

    try {
      const response = await this.openai.complete(
        `Generate 3-5 brief clinical suggestions for consultation ID: ${consultationId}. Return as JSON array of strings.`,
        'You are a medical assistant. Return only a valid JSON array of suggestion strings, no other text.',
      );

      let suggestions: string[] = [];
      try {
        const parsed = JSON.parse(response);
        suggestions = Array.isArray(parsed) ? parsed : [response];
      } catch {
        suggestions = response ? [response] : [];
      }

      return { data: { suggestions } };
    } catch {
      return { data: { suggestions: [] } };
    }
  }

  async generateClinicalNote(consultationData: {
    chiefComplaint?: string;
    symptoms?: string[];
    findings?: string;
  }) {
    if (!this.openai.isAvailable) {
      return {
        data: {
          note: '',
          message: 'OpenAI API key not configured',
        },
      };
    }

    try {
      const prompt = `Generate a professional clinical note based on:
- Chief complaint: ${consultationData.chiefComplaint || 'Not specified'}
- Symptoms: ${(consultationData.symptoms || []).join(', ') || 'Not specified'}
- Findings: ${consultationData.findings || 'Not specified'}

Format: Subjective, Objective, Assessment, Plan (SOAP). Be concise.`;

      const note = await this.openai.complete(
        prompt,
        'You are a medical scribe. Generate structured clinical notes in Spanish.',
      );

      return { data: { note: note || '' } };
    } catch {
      return { data: { note: '' } };
    }
  }
}
