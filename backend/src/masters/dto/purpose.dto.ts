import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePurposeDto {
  @IsString() @MinLength(1) name!: string;
}

export class UpdatePurposeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
