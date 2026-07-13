import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const DECISIONS = ['APPROVE', 'REJECT'] as const;

export class ReviewDocumentDto {
  @IsIn(DECISIONS) decision!: (typeof DECISIONS)[number];
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
