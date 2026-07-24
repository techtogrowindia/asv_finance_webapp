import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional approver/reject note on a savings refund review. */
export class RefundNotesDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
