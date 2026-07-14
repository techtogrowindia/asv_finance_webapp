import { IsBoolean, IsIn, IsOptional } from 'class-validator';

const FORECLOSURE_POLICIES = ['FULL', 'PRINCIPAL_ONLY', 'INTEREST_TO_DATE'] as const;

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() requireLoanProductAtEnrollment?: boolean;
  @IsOptional() @IsBoolean() autoCloseEod?: boolean;
  @IsOptional() @IsIn(FORECLOSURE_POLICIES) foreclosureInterestPolicy?: (typeof FORECLOSURE_POLICIES)[number];
}
