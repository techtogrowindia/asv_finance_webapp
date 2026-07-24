import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { KycNumberEntryDto } from './kyc-number.dto';

/** Nominee / co-applicant on a bulk-imported member. ID numbers are generic
 *  KYC entries keyed by the admin DocumentType id (party = NOMINEE). */
export class BulkNomineeDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) relation?: string;
  @IsOptional() @IsString() @MaxLength(15) mobile?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KycNumberEntryDto)
  kycNumbers?: KycNumberEntryDto[];
}

/** One member from the bulk-import sheet. Center is matched by code (within the
 *  importer's scope). KYC number columns are generated from — and mapped back to
 *  — the admin DocumentType masters (Settings), so the sheet always reflects
 *  whatever ID proofs the tenant has configured. */
export class BulkMemberRowDto {
  @IsString() @MinLength(1) centerCode!: string;
  @IsInt() @Min(1) @Max(5) groupNo!: number;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() @MaxLength(20) gender?: string;
  @IsOptional() @IsString() @MaxLength(15) mobile?: string;
  @IsOptional() @IsString() @MaxLength(120) fatherName?: string;
  @IsOptional() @IsString() @MaxLength(300) presentAddress?: string;
  @IsOptional() @IsString() @MaxLength(10) pincode?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() monthlyIncome?: string;
  @IsOptional() @IsString() monthlyExpense?: string;

  /** Client-party ID numbers, keyed by admin DocumentType id. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KycNumberEntryDto)
  kycNumbers?: KycNumberEntryDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BulkNomineeDto)
  nominee?: BulkNomineeDto;
}

export class BulkImportMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkMemberRowDto)
  rows!: BulkMemberRowDto[];
}
