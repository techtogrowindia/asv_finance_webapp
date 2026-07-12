import { IsOptional, IsUUID } from 'class-validator';

export class CloseEodDto {
  /** Required for HO (not tied to one branch); ignored for BM (forced to their own branch). */
  @IsOptional() @IsUUID() branchId?: string;
}
