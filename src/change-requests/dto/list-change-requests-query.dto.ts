import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListChangeRequestsQueryDto {
  @ApiProperty({ required: false, enum: ['open', 'resolved', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['open', 'resolved', 'all'])
  status?: 'open' | 'resolved' | 'all';

  @ApiProperty({ required: false, enum: ['mobile', 'web', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['mobile', 'web', 'all'])
  source?: 'mobile' | 'web' | 'all';
}
