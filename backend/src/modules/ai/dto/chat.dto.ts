import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HistoryEntryDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ description: 'Message text content' })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ChatDto {
  @ApiProperty({ description: "The user's message to the AI agent", example: 'Assign Alex Chen to the Nike campaign job' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({ type: [HistoryEntryDto], description: 'Prior conversation turns for context' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryEntryDto)
  history?: HistoryEntryDto[];

  @ApiPropertyOptional({ description: "IANA timezone name from the browser (e.g. 'Asia/Kolkata')", example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: "UTC offset string derived from the browser (e.g. '+05:30')", example: '+05:30' })
  @IsOptional()
  @IsString()
  tzOffset?: string;
}
