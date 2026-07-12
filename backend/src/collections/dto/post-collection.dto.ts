import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class PostCollectionDto {
  @IsUUID() loanId!: string;
  @IsNumber() @IsPositive() amount!: number;
}
