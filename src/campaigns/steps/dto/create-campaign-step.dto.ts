import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateCampaignStepDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  instrumentId: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  order: number;
}
