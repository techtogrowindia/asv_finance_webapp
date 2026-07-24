import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

/** One legacy loan from the bulk sheet. The member is matched by their Client ID
 *  (e.g. 5.29.1.1); the product by name. Explicit amounts from the sheet are
 *  trusted (interest = dueAmount × totalDues − loanAmount). `duesPaid` marks that
 *  many earliest installments as fully collected. */
export class BulkLegacyLoanRowDto {
  @IsString() @MinLength(1) clientDisplayId!: string;
  @IsOptional() @IsString() memberName?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsString() @MinLength(1) productName!: string;

  @IsNumber() @Min(1) loanAmount!: number;
  @IsString() disbursalDate!: string;
  @IsOptional() @IsNumber() @Min(0) dueAmount?: number;
  @IsString() dueStartDate!: string;
  @IsOptional() @IsString() dueEndDate?: string;
  @IsInt() @Min(1) totalDues!: number;
  @IsInt() @Min(0) duesPaid!: number;
}

export class BulkImportLoansDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkLegacyLoanRowDto)
  rows!: BulkLegacyLoanRowDto[];
}
