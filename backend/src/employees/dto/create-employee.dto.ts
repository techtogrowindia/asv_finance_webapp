import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const ROLES = ['FDO', 'BM', 'HO'] as const;

export class CreateEmployeeDto {
  @IsString() @MinLength(1) @MaxLength(20) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(3) @MaxLength(60) login!: string;
  @IsString() @MinLength(8) @MaxLength(100) password!: string;
  @IsIn(ROLES) role!: (typeof ROLES)[number];
  @IsOptional() @IsUUID() branchId?: string;
}
