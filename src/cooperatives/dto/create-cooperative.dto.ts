import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCooperativeDto {
  /** Nombre de la cooperativa */
  @ApiProperty({ example: 'Cooperativa Cacaotera del Meta', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  /** UUID del departamento al que pertenece la cooperativa */
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  departmentId: string;
}
