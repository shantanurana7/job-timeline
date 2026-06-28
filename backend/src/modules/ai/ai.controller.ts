import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatDto } from './dto/chat.dto';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('AI Agent')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ThrottlerGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with the AI agent — may return an action proposal' })
  async chat(
    @CurrentUser() currentUser: any,
    @Body() dto: ChatDto,
  ) {
    const result = await this.aiService.processQuery(
      currentUser.id,
      currentUser.role,
      dto.query,
      dto.history ?? [],
    );
    return ApiResponse.ok(result);
  }
}
