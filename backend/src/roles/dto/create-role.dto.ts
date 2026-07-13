import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsArray() @IsString({ each: true }) @ArrayUnique() permissions!: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
