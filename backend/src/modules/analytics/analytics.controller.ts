import {
  Controller, Get, Query, StreamableFile, UseGuards, UseInterceptors, Request,
} from '@nestjs/common';
import { Readable } from 'stream';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { Role } from '@prisma/client';

import { AnalyticsService } from './analytics.service';
import { ExportQueryDto } from './dto/export-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30)
  @ApiOperation({ summary: 'Dashboard KPIs and recent jobs (role-scoped)' })
  dashboard(@Request() req: any) {
    return this.analyticsService.getDashboard(req.user);
  }

  @Get('workload')
  @ApiOperation({ summary: 'Designer workload — active assignments and jobs' })
  workload() {
    return this.analyticsService.getDesignerWorkload();
  }

  @Get('streams')
  @ApiOperation({ summary: 'Stream throughput — job counts by status per stream' })
  streams() {
    return this.analyticsService.getStreamThroughput();
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.WORKFLOW_ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Export all jobs as a downloadable CSV file' })
  @ApiQuery({ name: 'format', enum: ['csv'], required: false, description: 'File format (csv only)' })
  async exportJobs(
    @Query() _query: ExportQueryDto,
    @CurrentUser() currentUser: any,
  ): Promise<StreamableFile> {
    const csv = await this.analyticsService.exportJobsCsv(currentUser);
    const today = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Readable.from([csv]), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="jobs-export-${today}.csv"`,
    });
  }
}
