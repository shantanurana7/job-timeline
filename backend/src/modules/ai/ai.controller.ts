import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('AI Agent')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ThrottlerGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with the AI agent' })
  async chat(
    @Request() req: any,
    @Body() body: { query: string; history?: Array<{ role: string, content: string }> }
  ) {
    return this.aiService.processQuery(req.user.id, body.query, body.history || []);
  }
}
