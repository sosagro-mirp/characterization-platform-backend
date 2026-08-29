import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeConsentRecordDto {
  /** Motivo de la revocación — obligatorio, queda como registro auditable */
  @ApiProperty({ example: 'Solicitud del titular vía correo' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
