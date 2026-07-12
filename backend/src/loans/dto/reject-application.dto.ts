import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectApplicationDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
