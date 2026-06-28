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
}
