import { IsBoolean } from 'class-validator';

export class UpdateSettingsDto {
  @IsBoolean() requireLoanProductAtEnrollment!: boolean;
}
