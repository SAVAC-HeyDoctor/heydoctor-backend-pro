import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
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
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ): Promise<{
    ok: true;
    action: string;
    paymentId?: string;
    duplicate?: boolean;
  }> {
    const raw =
      req.rawBody && Buffer.isBuffer(req.rawBody) ? req.rawBody : undefined;
    return this.paykuService.handleWebhook(headers, body, raw);
  }
}
