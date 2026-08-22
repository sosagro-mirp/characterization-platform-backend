import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSurveyDto {
  /** UUID del agricultor respondente (opcional si no está registrado en el sistema) */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  farmerId?: string;

  /** UUIDs de los instrumentos incluidos en esta sesión de encuesta */
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'IDs de los instrumentos que se aplicarán en esta sesión',
    example: ['550e8400-e29b-41d4-a716-446655440002'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  instrumentIds: string[];

  /** Indica si las respuestas ya fueron sincronizadas con el servidor */
  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  sincronized?: boolean;

  /** UUID del tipo de actor que responde la encuesta (propietario, extensionista, productor) */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsOptional()
  @IsUUID()
  actorTypeId?: string;

  /** UUID del departamento donde se aplica la encuesta */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440004',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  /** UUID del municipio donde se aplica la encuesta */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440005',
  })
  @IsOptional()
  @IsUUID()
  townId?: string;

  /** Nombre de la vereda donde se aplica la encuesta (texto libre) */
  @ApiPropertyOptional({ example: 'Vereda El Manzanillo', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vereda?: string;

  /** UUID del tipo de cultivo principal de la finca encuestada */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440006',
  })
  @IsOptional()
  @IsUUID()
  cropId?: string;

  /** UUID de la sesión de campaña a la que pertenece este survey (opcional) */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  campaignSessionId?: string;

  /** Orden del paso dentro de la campaña al que corresponde este survey (opcional) */
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  stepOrder?: number;

  /**
   * Id local generado por el cliente (spec 70, Fase 9). Si se envía y ya
   * existe una encuesta con ese id, el endpoint es idempotente: devuelve la
   * encuesta existente en vez de crear una nueva. Pensado para que el cliente
   * móvil reintente con seguridad tras perder la respuesta de un POST que sí
   * llegó al servidor.
   */
  @ApiPropertyOptional({
    example: 'local_survey_9c3f1b2a-8e7d-4f2e-9a1b-2c3d4e5f6a7b',
    maxLength: 100,
    description:
      'Id local del cliente. Repetirlo en un reintento devuelve la encuesta ya creada en vez de duplicarla.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientSurveyId?: string;
}
