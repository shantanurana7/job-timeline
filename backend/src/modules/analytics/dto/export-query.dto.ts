import { IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportQueryDto {
  @ApiPropertyOptional({ description: 'File format', enum: ['csv'], example: 'csv' })
  @IsOptional()
  format?: string;
}
