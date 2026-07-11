import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCenterDto {
  @IsString() @MinLength(1) @MaxLength(20) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsUUID() fdoId?: string;
  @IsOptional() @IsUUID() branchId?: string; // HO may target a branch; BM uses own
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(10) meetingDay?: string; // MON..SUN
  @IsOptional() @IsString() @MaxLength(20) meetingTime?: string;
  @IsOptional() @IsString() @MaxLength(200) meetingPlace?: string;
  @IsOptional() @IsString() @MaxLength(15) mobile?: string;
  @IsOptional() @IsString() formationDate?: string;
  @IsOptional() @IsString() nextMeeting?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
}

export class UpdateCenterDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsUUID() fdoId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(10) meetingDay?: string;
  @IsOptional() @IsString() @MaxLength(20) meetingTime?: string;
  @IsOptional() @IsString() @MaxLength(200) meetingPlace?: string;
  @IsOptional() @IsString() @MaxLength(15) mobile?: string;
  @IsOptional() @IsString() formationDate?: string;
  @IsOptional() @IsString() nextMeeting?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}
