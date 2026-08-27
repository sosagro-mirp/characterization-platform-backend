import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateConsentDocumentDto {
  /** Número de versión, único (ej. "1.0", "1.1") */
  @ApiProperty({ example: '1.0', maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  version: string;

  @ApiProperty({
    example:
      'Autorización para el tratamiento de datos personales — Proyecto SosAgro 4.C',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  /** Texto completo mostrado al encuestado, en párrafos */
  @ApiProperty({ example: 'Texto completo del consentimiento…' })
  @IsString()
  @IsNotEmpty()
  body: string;

  /** Cláusula: finalidad investigativa + no transferencia + anonimización */
  @ApiProperty({
    example:
      'Los datos personales se usan exclusivamente con fines de investigación…',
  })
  @IsString()
  @IsNotEmpty()
  dataProcessingClause: string;

  /** Cláusula de registro multimedia (foto/audio/video) */
  @ApiProperty({
    example: 'Durante el encuentro el equipo puede tomar fotografías…',
  })
  @IsString()
  @IsNotEmpty()
  multimediaClause: string;

  /** Derechos del titular y canal de contacto */
  @ApiProperty({
    example:
      'Usted puede conocer, actualizar, rectificar y suprimir sus datos…',
  })
  @IsString()
  @IsNotEmpty()
  rightsClause: string;

  @ApiProperty({
    example: 'Instituto Tecnológico Metropolitano — Proyecto SosAgro 4.C',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  responsibleEntity: string;

  @ApiProperty({ example: 'datos.sosagro@itm.edu.co', maxLength: 255 })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  contactEmail: string;
}
