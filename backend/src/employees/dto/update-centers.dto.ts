import { IsArray, IsUUID } from 'class-validator';

export class UpdateCentersDto {
  @IsArray() @IsUUID('4', { each: true }) centerIds!: string[];
}
