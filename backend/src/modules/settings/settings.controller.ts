import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

class UpdateSettingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  value: string;
}

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all settings (Admin only)' })
  async findAll() {
    const settings = await this.settingsService.findAll();
    return ApiResponse.ok(settings);
  }

  @Patch(':key')
  @ApiOperation({ summary: 'Update a setting value (Admin only)' })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: any,
  ) {
    const setting = await this.settingsService.update(key, dto.value, user.id);
    return ApiResponse.ok(setting, 'Setting updated');
  }
}
