import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const PARTIES = ['CLIENT', 'NOMINEE', 'BOTH'] as const;

export class CreateDocumentTypeDto {
  @IsString() @MinLength(1) name!: string;
  @IsIn(PARTIES) appliesTo!: (typeof PARTIES)[number];
  @IsOptional() @IsBoolean() isMandatory?: boolean;
}

export class UpdateDocumentTypeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(PARTIES) appliesTo?: (typeof PARTIES)[number];
  @IsOptional() @IsBoolean() isMandatory?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
