import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { KycNumberEntryDto } from './kyc-number.dto';

// Co-applicant / nominee (usually husband or family member) recorded per client.
// ID-number fields live in KycNumber (party=NOMINEE), driven by the same
// admin-managed DocumentType master as the client's own numbers.
export class CoApplicantDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(20) gender?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() @MaxLength(40) relation?: string;
  @IsOptional() @IsString() @MaxLength(15) mobile?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KycNumberEntryDto)
  kycNumbers?: KycNumberEntryDto[];
}
