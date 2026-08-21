import { ApiProperty } from '@nestjs/swagger';

export class DashboardKpiDto {
  @ApiProperty() key: string;
  @ApiProperty() label: string;

  @ApiProperty({
    nullable: true,
    description:
      'Valor numérico del KPI (porcentaje, media 1-5, o conteo). Null si suppressed=true — nunca un número inventado (spec 43, D5).',
  })
  value: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Para KPIs de tipo "opción más frecuente" (ej. Barrera #1): el texto de la opción ganadora.',
  })
  optionText?: string | null;

  @ApiProperty({
    required: false,
    description: 'Unidad de presentación: "%", "/5", etc.',
  })
  unit?: string;

  @ApiProperty({
    description:
      'true si la pregunta fuente de este KPI no alcanza el umbral mínimo de privacidad en la muestra filtrada.',
  })
  suppressed: boolean;
}
