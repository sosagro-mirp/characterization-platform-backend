import { ApiProperty } from '@nestjs/swagger';

export class DashboardDepartmentCountDto {
  @ApiProperty() departmentId: string;
  @ApiProperty() departmentName: string;
  @ApiProperty() count: number;
}
