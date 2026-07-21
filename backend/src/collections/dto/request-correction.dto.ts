import { IsDateString, IsNumber, IsString, IsUUID, Min, MinLength } from 'class-validator';

/** FDO asks to correct the REGULAR field collection they posted on `collectedOn`
 *  for `loanId`, to `correctedAmount`. Goes to a BM/HO approval queue. */
export class RequestCorrectionDto {
  @IsUUID() loanId!: string;
  @IsDateString() collectedOn!: string;
  @IsNumber() @Min(0) correctedAmount!: number;
  @IsString() @MinLength(3) reason!: string;
}
