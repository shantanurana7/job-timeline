import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.WORKFLOW_ADMIN)
  @ApiOperation({ summary: 'List all users' })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  @ApiQuery({ name: 'isActive', type: Boolean, required: false })
  @ApiQuery({ name: 'streamId', required: false })
  async findAll(
    @Query('role') role?: Role,
    @Query('isActive') isActive?: boolean,
    @Query('streamId') streamId?: string,
  ) {
    const users = await this.usersService.findAll({ role, isActive, streamId });
    return ApiResponse.ok(users);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    return ApiResponse.ok(user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return ApiResponse.ok(user, 'User created');
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user (Admin or self)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: any,
  ) {
    const user = await this.usersService.update(id, dto, currentUser.id, currentUser.role);
    return ApiResponse.ok(user, 'User updated');
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user (Admin only)' })
  async deactivate(@Param('id') id: string) {
    const user = await this.usersService.deactivate(id);
    return ApiResponse.ok(user, 'User deactivated');
  }
}
