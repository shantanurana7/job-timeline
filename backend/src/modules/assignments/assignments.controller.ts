import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, UnassignDto } from './dto/assignment.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Assignments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.WORKFLOW_ADMIN)
  @ApiOperation({ summary: 'Assign a designer to a job' })
  async assign(@Body() dto: CreateAssignmentDto, @CurrentUser() user: any) {
    const assignment = await this.assignmentsService.assign(dto, user.id);
    return ApiResponse.ok(assignment, 'Designer assigned');
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.WORKFLOW_ADMIN)
  @ApiOperation({ summary: 'Unassign a designer (moved to history)' })
  async unassign(
    @Param('id') id: string,
    @Body() dto: UnassignDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.assignmentsService.unassign(id, dto, user.id);
    return ApiResponse.ok(result);
  }

  @Get('designer/:designerId/schedule')
  @ApiOperation({ summary: "Get a designer's schedule" })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getDesignerSchedule(
    @Param('designerId') designerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const schedule = await this.assignmentsService.getDesignerSchedule(
      designerId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
    return ApiResponse.ok(schedule);
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: 'Get all active assignments for a job' })
  async getJobAssignments(@Param('jobId') jobId: string) {
    const assignments = await this.assignmentsService.getJobAssignments(jobId);
    return ApiResponse.ok(assignments);
  }

  @Get('timeline')
  @Roles(Role.ADMIN, Role.WORKFLOW_ADMIN)
  @ApiOperation({ summary: 'Get all designer schedules for the timeline view' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'streamId', required: false })
  async getTimeline(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('streamId') streamId?: string,
  ) {
    const data = await this.assignmentsService.getAllDesignerSchedules(
      new Date(from),
      new Date(to),
      streamId,
    );
    return ApiResponse.ok(data);
  }
}
