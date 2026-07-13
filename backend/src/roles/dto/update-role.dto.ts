import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayUnique() permissions?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
