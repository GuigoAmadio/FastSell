import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnly, type AuthedRequest } from '../common/roles';
import { PromotionDto, UpdatePreferencesDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/notification-preferences')
  async get(@Req() req: AuthedRequest) {
    return {
      preferences: await this.notifications.getPreferences(req.user.id),
      channels: this.notifications.channelStatus(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/notification-preferences')
  async update(@Req() req: AuthedRequest, @Body() dto: UpdatePreferencesDto) {
    return {
      preferences: await this.notifications.updatePreferences(req.user.id, dto),
      channels: this.notifications.channelStatus(),
    };
  }

  @AdminOnly()
  @Post('admin/notifications/promotions')
  promote(@Body() dto: PromotionDto) {
    return this.notifications.broadcastPromotion(dto.title, dto.message);
  }
}
