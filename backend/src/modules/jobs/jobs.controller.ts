import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, UseInterceptors
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JobStatus, JobPriority } from '@prisma/client';
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto, ChangeJobStatusDto, DelegateJobDto } from './dto/job.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

import { UserCacheInterceptor } from '../../common/interceptors/user-cache.interceptor';
import { CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(10)
  @ApiOperation({ summary: 'List jobs (role-scoped)' })
  @ApiQuery({ name: 'status', enum: JobStatus, required: false })
  @ApiQuery({ name: 'priority', enum: JobPriority, required: false })
  @ApiQuery({ name: 'streamId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'atRiskOnly', type: Boolean, required: false })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: JobStatus,
    @Query('priority') priority?: JobPriority,
    @Query('streamId') streamId?: string,
    @Query('search') search?: string,
    @Query('atRiskOnly') atRiskOnly?: boolean,
  ) {
    const jobs = await this.jobsService.findAll(user, { status, priority, streamId, search, atRiskOnly });
    return ApiResponse.ok(jobs, undefined, { count: jobs.length });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job detail' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const job = await this.jobsService.findOne(id, user);
    return ApiResponse.ok(job);
  }

  @Post()
  @ApiOperation({ summary: 'Submit a new job' })
  async create(@Body() dto: CreateJobDto, @CurrentUser() user: any) {
    const job = await this.jobsService.create(dto, user);
    return ApiResponse.ok(job, `Job ${job.jobNumber} created`);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update job fields' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: any,
  ) {
    const job = await this.jobsService.update(id, dto, user);
    return ApiResponse.ok(job, 'Job updated');
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change job status (state machine enforced)' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeJobStatusDto,
    @CurrentUser() user: any,
  ) {
    const job = await this.jobsService.changeStatus(id, dto, user);
    return ApiResponse.ok(job, `Status changed to ${dto.status}`);
  }

  @Post(':id/delegate')
  @ApiOperation({ summary: 'Delegate job to another stream (max 3 hops)' })
  async delegate(
    @Param('id') id: string,
    @Body() dto: DelegateJobDto,
    @CurrentUser() user: any,
  ) {
    const job = await this.jobsService.delegate(id, dto, user);
    return ApiResponse.ok(job, 'Job delegated');
  }
}
