import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFarmDto {
  /** Nombre de la finca */
  @ApiProperty({ example: 'Finca El Paraíso', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  /** Descripción de la ubicación o dirección de la finca */
  @ApiProperty({ example: 'Vereda El Manzanillo, km 5 vía Apartadó', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location: string;

  /** Área de la finca en hectáreas */
  @ApiProperty({ example: 12.5, minimum: 0 })
  @IsNumber()
  @Min(0)
  area: number;

  /** Indica si la finca tiene acceso a agua */
  @ApiProperty({ example: true })
  @IsBoolean()
  waterAccess: boolean;

  /** Indica si la finca tiene acceso a internet */
  @ApiProperty({ example: false })
  @IsBoolean()
  internetAccess: boolean;

  /** Indica si la finca tiene suministro eléctrico estable */
  @ApiProperty({ example: true })
  @IsBoolean()
  hasStabilityElectricity: boolean;

  /** Indica si la finca tiene acceso a asistencia técnica */
  @ApiProperty({ example: false })
  @IsBoolean()
  technicalAssistanceAccess: boolean;

  /** UUID del municipio donde se ubica la finca */
  @ApiPropertyOptional({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  townId?: string;

  /** UUIDs de los tipos de cultivo asociados a la finca */
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  cropIds?: string[];

  /** UUIDs de los dispositivos tecnológicos disponibles en la finca */
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    example: ['550e8400-e29b-41d4-a716-446655440001'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  deviceIds?: string[];
}
