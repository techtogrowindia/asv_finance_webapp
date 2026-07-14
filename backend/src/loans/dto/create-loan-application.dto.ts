import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLoanApplicationDto {
  @IsUUID() clientId!: string;
  @IsUUID() productId!: string;
  @IsUUID() purposeId!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
