import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** BM/HO approves a correction. `confirmClosure` must be true when applying it
 *  would close a loan or re-open a closed one (the extra safety check). */
export class ApproveCorrectionDto {
  @IsOptional() @IsBoolean() confirmClosure?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class RejectCorrectionDto {
  @IsOptional() @IsString() notes?: string;
}
