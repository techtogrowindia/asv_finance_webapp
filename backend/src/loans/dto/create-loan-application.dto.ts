import { IsUUID } from 'class-validator';

export class CreateLoanApplicationDto {
  @IsUUID() clientId!: string;
  @IsUUID() productId!: string;
  @IsUUID() purposeId!: string;
}
