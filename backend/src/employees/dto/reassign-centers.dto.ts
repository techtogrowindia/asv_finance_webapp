import { IsUUID } from 'class-validator';

export class ReassignCentersDto {
  @IsUUID() toEmployeeId!: string;
}
