import { EntityManager } from 'typeorm';
import { ConsentDocument } from 'src/consents/entities/consent-document.entity';

/**
 * Spec 78 — versión 1.0 del documento de consentimiento informado y
 * autorización de tratamiento de datos personales. Texto propuesto en el
 * anexo de `spec/78_consentimiento_informado_tratamiento_datos.md`; debe
 * revisarlo el responsable jurídico del proyecto antes de publicarse en
 * producción. El seed la deja en `draft`: publicarla es una acción explícita
 * (`POST /api/consent-documents/:id/publish`), no algo que un seed decida.
 */
const CONSENT_DOCUMENT_V1 = {
  version: '1.0',
  title:
    'Autorización para el tratamiento de datos personales — Proyecto SosAgro 4.C',
  body:
    'Los datos personales que usted entrega en esta encuesta (nombre, documento de ' +
    'identidad, contacto, características de su unidad productiva y su ubicación) se ' +
    'recolectan exclusivamente con fines de investigación, en el marco del proyecto ' +
    'SosAgro 4.C (SGR, SIGP 108927), para caracterizar las capacidades técnicas y ' +
    'humanas de las unidades productivas de café, cacao, cannabis y cáñamo en Colombia.',
  dataProcessingClause:
    'Sus datos personales no serán compartidos, vendidos ni cedidos a ninguna otra ' +
    'entidad, en ningún momento, ni se usarán con fines comerciales, publicitarios o de ' +
    'calificación crediticia. Los resultados que se publiquen en el sitio web del ' +
    'proyecto o en informes son anonimizados y agregados: nunca aparece su nombre, su ' +
    'documento ni la ubicación de su finca, y los grupos con pocos participantes se ' +
    'omiten para que nadie pueda ser identificado.',
  multimediaClause:
    'Durante el encuentro el equipo puede tomar fotografías, grabar audio o grabar ' +
    'video con fines de registro y análisis de la investigación. Usted decide de manera ' +
    'independiente si autoriza cada uno de estos registros, y puede negarlos sin que eso ' +
    'afecte su participación en la encuesta.',
  rightsClause:
    'Usted puede conocer, actualizar y rectificar sus datos, solicitar prueba de esta ' +
    'autorización, ser informado sobre el uso que se les ha dado, presentar quejas ante ' +
    'la Superintendencia de Industria y Comercio, revocar esta autorización y solicitar ' +
    'la supresión de sus datos en cualquier momento, escribiendo al correo de contacto ' +
    'del proyecto. La revocación no afecta los análisis agregados ya publicados, que no ' +
    'permiten identificarlo.',
  responsibleEntity:
    'Instituto Tecnológico Metropolitano — Proyecto SosAgro 4.C',
  contactEmail: 'datos.sosagro@itm.edu.co',
};

export async function seedConsentDocument(
  manager: EntityManager,
): Promise<void> {
  const repo = manager.getRepository(ConsentDocument);

  const existing = await repo.findOne({
    where: { version: CONSENT_DOCUMENT_V1.version },
  });

  if (existing) {
    console.log(
      `[seed] ConsentDocument versión "${CONSENT_DOCUMENT_V1.version}" ya existe. Se omite.`,
    );
    return;
  }

  const document = repo.create({ ...CONSENT_DOCUMENT_V1, status: 'draft' });
  await repo.save(document);
  console.log(
    `[seed] ConsentDocument creado: versión ${CONSENT_DOCUMENT_V1.version} (draft — publicar manualmente).`,
  );
}
