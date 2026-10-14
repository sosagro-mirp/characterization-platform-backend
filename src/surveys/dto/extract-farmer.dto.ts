import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

// Spec 68 — resolución explícita de una colisión de documentId. Sin
// resolución (body vacío, el default que ya envía el móvil hoy), el backend
// responde 409 ante una colisión en vez de fusionar en silencio.
export class ExtractFarmerDto {
  @ApiPropertyOptional({
    enum: ['same_person', 'separate_person'],
    description:
      'Resolución explícita de una colisión ya avisada. Sin ella, una colisión responde 409.',
  })
  @IsOptional()
  @IsIn(['same_person', 'separate_person'])
  resolution?: 'same_person' | 'separate_person';

  // Spec 68, Fase 8 — "Corregir el documento". Cuando el aviso de colisión
  // se debe a un documento mal digitado, el encuestador lo corrige y la
  // extracción se reintenta con el valor nuevo. No basta con reenviar la
  // encuesta: para entonces ya está sincronizada, y `createMany()` ignora
  // por diseño un batch cuya encuesta ya tiene respuestas, así que la
  // corrección nunca llegaría. Este campo la aplica sobre la respuesta ya
  // persistida antes de re-derivar el agricultor.
  @ApiPropertyOptional({
    description:
      'Documento corregido por el encuestador tras un aviso de colisión (spec 68). ' +
      'Actualiza la respuesta de documento de la encuesta antes de extraer el agricultor.',
    minLength: 3,
    maxLength: 50,
  })
  @IsOptional()
  // `@Length` se evalúa sobre el valor ya recortado: sin esto, "   " o "  12  "
  // pasaban la validación y se guardaban recortados por debajo del mínimo.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 50)
  correctedDocumentId?: string;
}
