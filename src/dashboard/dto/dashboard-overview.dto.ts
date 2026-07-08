import { ApiProperty } from '@nestjs/swagger';
import { AggregationNumericDto } from './dashboard-response.dto';

export class DashboardOverviewBucketDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() count: number;
}

export class DashboardOverviewDto {
  @ApiProperty() totalCount: number;
  @ApiProperty() suppressed: boolean;

  @ApiProperty({ type: [DashboardOverviewBucketDto] })
  byActorType: DashboardOverviewBucketDto[];

  @ApiProperty({ type: [DashboardOverviewBucketDto] })
  byCrop: DashboardOverviewBucketDto[];

  @ApiProperty({ type: [DashboardOverviewBucketDto] })
  byDepartment: DashboardOverviewBucketDto[];

  @ApiProperty({
    type: AggregationNumericDto,
    nullable: true,
    description: 'Estadísticas de farmer.age. Null si no hay muestra suficiente o la pregunta no existe.',
  })
  age: AggregationNumericDto | null;

  @ApiProperty({
    type: AggregationNumericDto,
    nullable: true,
    description: 'Estadísticas de farmer.experienceYears.',
  })
  experienceYears: AggregationNumericDto | null;
}
