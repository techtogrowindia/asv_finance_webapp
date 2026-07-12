import { Type } from 'class-transformer';
import { IsArray, IsIn, IsString, IsUUID, ValidateNested } from 'class-validator';

export class KycNumberEntryDto {
  @IsUUID() documentTypeId!: string;
  /** Blank clears/removes the value. */
  @IsString() value!: string;
}

/** Body for PATCH /clients/:id/kyc-numbers — upserts/clears a party's ID numbers. */
export class UpdateKycNumbersDto {
  @IsIn(['CLIENT', 'NOMINEE']) party!: 'CLIENT' | 'NOMINEE';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KycNumberEntryDto)
  entries!: KycNumberEntryDto[];
}
