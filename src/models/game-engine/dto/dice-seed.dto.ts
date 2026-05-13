import { IsInt, Max, Min } from "class-validator";


export class DiceSeedDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  value!: number;
}
