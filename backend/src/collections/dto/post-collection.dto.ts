import { IsNumber, IsOptional, IsPositive, Min, IsUUID } from 'class-validator';

export class PostCollectionDto {
  @IsUUID() loanId!: string;
  @IsNumber() @IsPositive() amount!: number;
  // Savings to bank with this collection. Omitted = the tenant default;
  // 0 = the client chose not to pay savings this time.
  @IsOptional() @IsNumber() @Min(0) savings?: number;
}
