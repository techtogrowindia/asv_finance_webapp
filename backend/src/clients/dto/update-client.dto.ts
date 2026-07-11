import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Profile-only update. Center/group placement is changed via a separate,
// audited transfer operation (added later), not here.
export class UpdateClientDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() @MaxLength(20) gender?: string;
  @IsOptional() @IsString() @MaxLength(15) mobile?: string;
  @IsOptional() @IsString() @MaxLength(300) presentAddress?: string;
  @IsOptional() @IsString() @MaxLength(10) pincode?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @IsNumber() @Min(0) monthlyExpense?: number;
  @IsOptional() @IsString() @MaxLength(120) fatherName?: string;
  @IsOptional() @IsString() dateOfJoining?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
