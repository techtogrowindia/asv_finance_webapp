import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() requireLoanProductAtEnrollment?: boolean;
  @IsOptional() @IsBoolean() autoCloseEod?: boolean;
}
