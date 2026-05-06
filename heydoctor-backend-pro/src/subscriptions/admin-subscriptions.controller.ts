import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { SubscriptionEventsService } from './subscription-events.service';

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionEvents: SubscriptionEventsService) {}

  @Get(':userId/events')
  listEventsForUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): ReturnType<SubscriptionEventsService['findByUserId']> {
    return this.subscriptionEvents.findByUserId(userId);
  }
}
