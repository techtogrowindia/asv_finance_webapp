import { IsString, MaxLength } from 'class-validator';

export class UpdateApplicationNotesDto {
  @IsString() @MaxLength(500) notes!: string;
}
