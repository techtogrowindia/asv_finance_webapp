import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { KycNumberEntryDto } from './kyc-number.dto';
import { CoApplicantDto } from './co-applicant.dto';

export class CreateClientDto {
  @IsUUID()
  centerId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  groupNo!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() dob?: string; // ISO date

  @IsOptional() @IsString() @MaxLength(20) gender?: string;

  @IsOptional() @IsString() @MaxLength(15) mobile?: string;

  @IsOptional() @IsString() @MaxLength(300) presentAddress?: string;

  @IsOptional() @IsString() @MaxLength(10) pincode?: string;

  @IsOptional() @IsString() @MaxLength(80) district?: string;

  @IsOptional() @IsString() @MaxLength(80) state?: string;

  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;

  @IsOptional() @IsNumber() @Min(0) monthlyExpense?: number;

  @IsOptional() @IsString() @MaxLength(120) fatherName?: string;

  @IsOptional() @IsString() dateOfJoining?: string; // ISO date

  /** Loan product + purpose preference at enrollment (informational; paired —
   *  mandatory/optional is an admin-configured tenant setting, enforced
   *  server-side; when required, both must be present together). */
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() purposeId?: string;

  /** Client-party ID numbers, keyed by admin-managed DocumentType id. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KycNumberEntryDto)
  kycNumbers?: KycNumberEntryDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CoApplicantDto)
  coApplicant?: CoApplicantDto;
}
