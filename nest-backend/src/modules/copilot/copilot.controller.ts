import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { GenerateClinicalNoteDto } from './dto/generate-note.dto';

@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Get('suggestions')
  async getSuggestions(@Query('consultationId') consultationId: string) {
    return this.copilotService.getSuggestions(consultationId || '');
  }

  @Post('generate-clinical-note')
  async generateClinicalNote(@Body() dto: GenerateClinicalNoteDto) {
    return this.copilotService.generateClinicalNote(dto);
  }
}
