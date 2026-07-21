import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsInt,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** One past installment's actual history: how much of the (system-computed)
 *  due amount was really collected, plus any savings banked alongside it. */
export class ImportLegacyRowDto {
  @IsInt() @Min(1) dueNo!: number;
  @IsNumber() @Min(0) collected!: number;
  @IsNumber() @Min(0) savings!: number;
}

/** Bring a pre-existing (manually-run) loan into the system as an OPEN loan.
 *  Terms come from the chosen product (schedule stays flat-interest, invariant
 *  #6); `rows` reconstruct the week-by-week repayment + savings history. */
export class ImportLegacyLoanDto {
  @IsUUID() clientId!: string;
  @IsUUID() productId!: string;
  @IsISO8601() disbursalDate!: string;
  @IsISO8601() dueStartDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportLegacyRowDto)
  rows!: ImportLegacyRowDto[];
}
