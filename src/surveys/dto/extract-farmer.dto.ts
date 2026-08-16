import { IsIn, IsOptional } from 'class-validator';

// Spec 68 — resolución explícita de una colisión de documentId. Sin
// resolución (body vacío, el default que ya envía el móvil hoy), el backend
// responde 409 ante una colisión en vez de fusionar en silencio.
export class ExtractFarmerDto {
  @IsOptional()
  @IsIn(['same_person', 'separate_person'])
  resolution?: 'same_person' | 'separate_person';
}
