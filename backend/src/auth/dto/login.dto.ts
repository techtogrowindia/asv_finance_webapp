import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  login!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /**
   * Which portal the login came from. "employee" only allows FDO; "admin" only
   * allows BM/HO. Prevents cross-portal login. Optional (defaults to allowing any).
   */
  @IsOptional()
  @IsIn(['employee', 'admin'])
  portal?: 'employee' | 'admin';
}
