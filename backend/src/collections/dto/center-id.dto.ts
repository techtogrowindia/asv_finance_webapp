import { IsUUID } from 'class-validator';

export class CenterIdDto {
  @IsUUID() centerId!: string;
}
