import { IsString, IsBoolean, IsOptional, IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssignmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  designerId: string;

  @ApiProperty({ example: '2025-12-20T09:00:00Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2025-12-20T17:00:00Z' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UnassignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
