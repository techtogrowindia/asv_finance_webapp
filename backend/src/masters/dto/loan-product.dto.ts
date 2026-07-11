import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateLoanProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsNumber() @Min(1) loanAmount!: number;
  @IsInt() @Min(1) totalDues!: number;
  @IsNumber() @Min(0) interestAmount!: number;
  @IsUUID() frequencyId!: string;
}

export class UpdateLoanProductDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsNumber() @Min(1) loanAmount?: number;
  @IsOptional() @IsInt() @Min(1) totalDues?: number;
  @IsOptional() @IsNumber() @Min(0) interestAmount?: number;
  @IsOptional() @IsUUID() frequencyId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
