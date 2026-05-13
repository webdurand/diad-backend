import { IsOptional, IsString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";


export class LibraryQueryDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  name?: string;


  @IsOptional()
  @IsString()
  cr?: string;


  @IsOptional()
  @IsString()
  type?: string;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  level?: number;


  @IsOptional()
  @IsString()
  school?: string;


  @IsOptional()
  @IsString()
  class?: string;


  @IsOptional()
  @IsString()
  category?: string;
}
