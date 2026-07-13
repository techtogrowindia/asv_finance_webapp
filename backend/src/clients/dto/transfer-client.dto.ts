import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class TransferClientDto {
  @IsUUID() centerId!: string;
  @IsInt() @Min(1) @Max(5) groupNo!: number;
}
