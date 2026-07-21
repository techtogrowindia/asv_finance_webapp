import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';

export class BulkImportRowDto {
  @IsString() @MinLength(1) loanAccount!: string;
  @IsNumber() @IsPositive() amount!: number;
  // Savings to bank with this row. Omitted = the tenant default; 0 = skip savings for this row.
  @IsOptional() @IsNumber() @Min(0) savings?: number;
}

/** Body for POST /collections/bulk-import — one center's collections from an
 *  uploaded Excel sheet, matched by loan account. */
export class BulkImportCollectionDto {
  @IsUUID() centerId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportRowDto)
  rows!: BulkImportRowDto[];
}
