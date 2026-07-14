import { IsISO8601, IsOptional } from 'class-validator';

/** Both dates are optional — default to the branch's working_date when omitted. */
export class DisburseLoanDto {
  @IsOptional() @IsISO8601() disbursalDate?: string;
  @IsOptional() @IsISO8601() dueStartDate?: string;
}
