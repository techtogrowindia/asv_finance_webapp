import { IsOptional, IsString, MaxLength } from 'class-validator';

// Co-applicant / nominee (usually husband or family member) recorded per client.
export class CoApplicantDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(20) gender?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() @MaxLength(40) relation?: string;
  @IsOptional() @IsString() @MaxLength(15) mobile?: string;
  @IsOptional() @IsString() @MaxLength(30) voterId?: string;
  @IsOptional() @IsString() @MaxLength(30) otherId?: string;
  @IsOptional() @IsString() @MaxLength(20) pan?: string;
}
