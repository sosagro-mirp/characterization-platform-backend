import { Farmer } from 'src/farmers/entities/farmer.entity';
import { FarmerDocumentCollision } from 'src/farmers/entities/farmer-document-collision.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import type { EntityManager } from 'typeorm';

/**
 * Spec 93 — colisión de documento detectada dentro de la transacción. Se
 * separa detectar de registrar: la transacción se revierte y la fila de
 * colisión pendiente se escribe aparte (`FarmerExtractionService`) antes del 409.
 */
export class DocumentCollisionError extends Error {
  constructor(
    readonly surveyId: string,
    readonly documentId: string,
    readonly submittedName: string,
    readonly existingFarmer: Farmer,
  ) {
    super('document collision');
  }
}

/**
 * Spec 68 — una fila pendiente (sin resolución) por combinación
 * (documentId, submittedName, existingFarmer): un reintento sin resolución
 * (p. ej. la cola de sincronización del móvil) actualiza la misma fila en vez
 * de acumular duplicados, y resolverla la actualiza en lugar de insertar otra.
 * Spec 95: siempre con el `manager` recibido, para participar en su transacción.
 */
export async function upsertDocumentCollision(
  manager: EntityManager,
  params: {
    documentId: string;
    submittedName: string;
    existingFarmer: Farmer;
    resolution: 'same_person' | 'separate_person' | null;
    survey: Survey;
  },
): Promise<void> {
  const repository = manager.getRepository(FarmerDocumentCollision);
  const existingRow = await repository.findOne({
    where: {
      documentId: params.documentId,
      submittedName: params.submittedName,
      existingFarmer: { id: params.existingFarmer.id },
    },
  });

  if (existingRow) {
    // Ya resuelta — se deja como está. Salvo `corrected`: esa fila cerró un
    // error de captura, no una decisión sobre dos personas, así que un
    // nuevo choque idéntico debe volver a quedar pendiente.
    if (existingRow.resolution && existingRow.resolution !== 'corrected') {
      return;
    }
    // `.update()`, no cargar y `.save()`: `existingRow` no trae las relaciones
    // `survey`/`existingFarmer` y guardarla parcial podría dejar `survey_id`
    // en null. Spec 93: la fila pasa a apuntar a la encuesta que la dispara.
    await repository.update(existingRow.collisionId, {
      resolution: params.resolution,
      resolvedAt: params.resolution ? new Date() : null,
      survey: params.survey,
    });
    return;
  }

  await repository.save(
    repository.create({
      documentId: params.documentId,
      submittedName: params.submittedName,
      existingFarmer: params.existingFarmer,
      existingFarmerName: params.existingFarmer.name,
      resolution: params.resolution,
      resolvedAt: params.resolution ? new Date() : null,
      survey: params.survey,
    }),
  );
}
