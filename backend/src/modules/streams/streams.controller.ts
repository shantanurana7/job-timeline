import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { StreamsService } from './streams.service';
import { CreateStreamDto, UpdateStreamDto, AddStreamMemberDto } from './dto/stream.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Streams')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('streams')
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

  @Get()
  @ApiOperation({ summary: 'List all streams' })
  @ApiQuery({ name: 'all', type: Boolean, required: false })
  async findAll(@Query('all') all?: boolean) {
    const streams = await this.streamsService.findAll(!all);
    return ApiResponse.ok(streams);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get stream by ID' })
  async findOne(@Param('id') id: string) {
    const stream = await this.streamsService.findOne(id);
    return ApiResponse.ok(stream);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create stream (Admin only)' })
  async create(@Body() dto: CreateStreamDto) {
    const stream = await this.streamsService.create(dto);
    return ApiResponse.ok(stream, 'Stream created');
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update stream (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateStreamDto) {
    const stream = await this.streamsService.update(id, dto);
    return ApiResponse.ok(stream, 'Stream updated');
  }

  @Post(':id/members')
  @Roles(Role.ADMIN, Role.WORKFLOW_ADMIN)
  @ApiOperation({ summary: 'Add member to stream' })
  async addMember(@Param('id') id: string, @Body() dto: AddStreamMemberDto) {
    const member = await this.streamsService.addMember(id, dto);
    return ApiResponse.ok(member, 'Member added');
  }

  @Delete(':id/members/:userId')
  @Roles(Role.ADMIN, Role.WORKFLOW_ADMIN)
  @ApiOperation({ summary: 'Remove member from stream' })
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    const result = await this.streamsService.removeMember(id, userId);
    return ApiResponse.ok(result);
  }
}
