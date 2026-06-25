import { Controller, Get, UseGuards, Request, UseInterceptors } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30)
  dashboard(@Request() req: any) {
    return this.analyticsService.getDashboard(req.user);
  }

  @Get('workload')
  workload() {
    return this.analyticsService.getDesignerWorkload();
  }

  @Get('streams')
  streams() {
    return this.analyticsService.getStreamThroughput();
  }
}
