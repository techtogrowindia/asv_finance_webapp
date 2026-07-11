import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateFrequencyDto {
  @IsString() @MinLength(1) code!: string; // e.g. DLY, WKS, MNS, MON
  @IsString() @MinLength(1) name!: string;
  @IsInt() @Min(1) daysBetween!: number;
}

export class UpdateFrequencyDto {
  @IsOptional() @IsString() @MinLength(1) code?: string;
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() @Min(1) daysBetween?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
