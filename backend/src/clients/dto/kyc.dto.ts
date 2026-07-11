import { IsOptional, IsString, MaxLength } from 'class-validator';

// Government ID proofs, matched to the fields captured at enrollment.
// Aadhaar (uid) is sensitive: stored here, but masked on every API read.
export class KycDto {
  @IsOptional() @IsString() @MaxLength(30) voterId?: string;
  @IsOptional() @IsString() @MaxLength(30) otherId?: string;
  @IsOptional() @IsString() @MaxLength(20) pan?: string;
  @IsOptional() @IsString() @MaxLength(30) smartCard?: string;
  @IsOptional() @IsString() @MaxLength(30) rationCard?: string;
  @IsOptional() @IsString() @MaxLength(20) uid?: string; // Aadhaar
}
