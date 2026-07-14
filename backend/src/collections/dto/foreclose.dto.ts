import { IsNumber, IsOptional, Min } from 'class-validator';

export class ForecloseDto {
  /** Discretionary interest to waive (BM/HO, gated by collection.waive). */
  @IsOptional() @IsNumber() @Min(0) waiveInterest?: number;
}
