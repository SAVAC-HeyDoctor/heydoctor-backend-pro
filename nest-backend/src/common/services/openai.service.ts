import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private client: OpenAI | null = null;
  private readonly hasApiKey: boolean;

  constructor() {
    this.hasApiKey = !!process.env.OPENAI_API_KEY;
    if (this.hasApiKey) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  get isAvailable(): boolean {
    return this.hasApiKey && this.client !== null;
  }

  async chatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { model?: string; temperature?: number },
  ): Promise<string> {
    if (!this.client) {
      return '';
    }

    const response = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4o-mini',
      messages,
      temperature: options?.temperature ?? 0.7,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return this.chatCompletion(messages);
  }
}
