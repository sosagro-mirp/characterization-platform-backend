import { ApiProperty } from '@nestjs/swagger';

export class DashboardCategoryDto {
  @ApiProperty({ example: 'C1' })
  id: string;

  @ApiProperty({ example: 'C1' })
  code: string;

  @ApiProperty({ example: 'Perfil del productor' })
  name: string;

  @ApiProperty({
    description: 'Instrumentos activos que alimentan esta categoría.',
    example: 1,
  })
  instrumentCount: number;

  @ApiProperty({
    description:
      'Preguntas visualizables (elegibles) agregadas de esta categoría.',
    example: 8,
  })
  questionCount: number;
}
