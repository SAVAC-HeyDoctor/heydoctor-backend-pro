import {
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { PaykuService } from './payku.service';

@Controller('payku')
export class PaykuController {
  constructor(private readonly paykuService: PaykuService) {}

  @Post('create-payment-session')
  @UseGuards(JwtAuthGuard)
  async createPaymentSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentSessionDto,
  ) {
    return this.paykuService.createPaymentSession(dto.consultationId, user);
  }

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ): Promise<{
    ok: true;
    action: string;
    paymentId?: string;
    duplicate?: boolean;
  }> {
    return this.paykuService.handleWebhook(headers, body);
  }
}
