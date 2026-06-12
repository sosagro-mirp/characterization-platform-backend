import { IsUUID } from 'class-validator';

export class CheckDuplicateQueryDto {
  @IsUUID()
  farmerId: string;

  @IsUUID()
  instrumentId: string;

  @IsUUID()
  campaignId: string;
}
