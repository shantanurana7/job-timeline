import {
  IsString, IsEnum, IsOptional, IsDateString, IsNotEmpty, MaxLength, IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { JobStatus, JobPriority } from '@prisma/client';

export class CreateJobDto {
  @ApiProperty({ example: 'Annual Report Cover Design' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Design the cover for our 2024 annual report.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: JobPriority, default: JobPriority.MEDIUM })
  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:00Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ example: 'ACME-2024' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  streamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: JobPriority })
  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  streamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ChangeJobStatusDto {
  @ApiProperty({ enum: JobStatus })
  @IsEnum(JobStatus)
  status: JobStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DelegateJobDto {
  @ApiProperty({ description: 'Target stream ID' })
  @IsString()
  @IsNotEmpty()
  toStreamId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class JobFiltersDto {
  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ enum: JobPriority })
  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  streamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  atRiskOnly?: boolean;
}
