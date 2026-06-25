import { Controller, Get, Patch, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Get user's notifications" })
  @ApiQuery({ name: 'unreadOnly', type: Boolean, required: false })
  async findAll(@CurrentUser() user: any, @Query('unreadOnly') unreadOnly?: boolean) {
    const notifications = await this.notificationsService.findAll(user.id, unreadOnly);
    const unreadCount = await this.notificationsService.getUnreadCount(user.id);
    return ApiResponse.ok(notifications, undefined, { unreadCount });
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  async markRead(@Param('id') id: string, @CurrentUser() user: any) {
    await this.notificationsService.markRead(id, user.id);
    return ApiResponse.ok(null, 'Marked as read');
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() user: any) {
    await this.notificationsService.markAllRead(user.id);
    return ApiResponse.ok(null, 'All notifications marked as read');
  }
}
