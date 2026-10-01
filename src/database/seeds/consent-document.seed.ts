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

/**
 * Spec 85 (Fase 1.3) — versión 1.1: declara qué datos son sensibles y que
 * responderlos es facultativo (Ley 1581 de 2012 y Decreto 1377 de 2013,
 * art. 12). Parte del texto realmente publicado de la v1.0 (que difiere del
 * texto sembrado arriba: los seeds están desfasados) y solo AGREGA el párrafo
 * de datos sensibles al cuerpo, sin cambios de esquema. Debe revisarlo el
 * responsable jurídico del proyecto antes de publicarse. También queda en
 * `draft`: publicarla es una acción explícita.
 */
const SENSITIVE_DATA_PARAGRAPH =
  'Datos sensibles. En el Registro se le pregunta si el productor pertenece a alguno ' +
  'de estos grupos o territorios: comunidades negras, afrocolombianas, raizales o ' +
  'palenqueras; comunidad LGBTIQ+; municipio en zona PDET o ZOMAC. Algunos de ellos ' +
  '—como el origen étnico o racial y la orientación sexual— son datos sensibles: ' +
  'pueden afectar su intimidad o llevar a que alguien sea discriminado. Por eso ' +
  'responder esa pregunta es completamente opcional: puede dejarla sin responder o ' +
  'elegir «Prefiero no responder», sin ninguna consecuencia. Si la responde, solo se ' +
  'usa para la investigación y nunca se publica de forma individual.';

const CONSENT_DOCUMENT_V1_1 = {
  version: '1.1',
  title: CONSENT_DOCUMENT_V1.title,
  body:
    'Le estamos invitando a participar en una encuesta del proyecto SosAgro 4.C ' +
    '(Sistema General de Regalías, SIGP 108927), que estudia las capacidades técnicas ' +
    'y humanas de las unidades productivas de café, cacao, cannabis y cáñamo en ' +
    'Colombia.\n\n' +
    'Para ese estudio necesitamos registrar algunos datos suyos: su nombre, su número ' +
    'de documento, sus datos de contacto (teléfono y correo, si los tiene), algunos ' +
    'datos generales como su edad, género y nivel educativo, y las características y ' +
    'la ubicación de su unidad productiva, incluida su ubicación geográfica.\n\n' +
    'Esta información se usa únicamente con fines de investigación dentro de este ' +
    'proyecto. No se usa para decidir sobre subsidios, créditos, programas de ' +
    'gobierno, ni para ningún trámite que lo afecte a usted.\n\n' +
    SENSITIVE_DATA_PARAGRAPH +
    '\n\n' +
    'Participar es voluntario. Puede negarse a responder cualquier pregunta, o ' +
    'terminar la encuesta en el momento que quiera, sin tener que dar explicaciones y ' +
    'sin que eso le traiga ninguna consecuencia.',
  dataProcessingClause:
    'Sus datos personales no se venden, no se comparten ni se entregan a ninguna otra ' +
    'entidad, empresa o persona. No se usan con fines comerciales, publicitarios, ni ' +
    'para evaluar su comportamiento crediticio.\n\n' +
    'Solo el equipo de investigación del proyecto tiene acceso a la información que lo ' +
    'identifica a usted.\n\n' +
    'Los resultados que se publican —en el sitio web del proyecto, en informes o en ' +
    'presentaciones— son siempre cifras agrupadas y anónimas. Nunca aparece su ' +
    'nombre, su documento, su teléfono ni la ubicación de su finca. Además, cuando un ' +
    'grupo tiene muy pocos participantes, esos resultados no se muestran, ' +
    'precisamente para que nadie pueda deducir de quién se trata.\n\n' +
    'Sus datos se conservan mientras dure el proyecto y el tiempo que la ley exija ' +
    'para respaldar sus resultados. Después se eliminan o se anonimizan de forma ' +
    'definitiva.',
  multimediaClause:
    'Durante la visita, el equipo puede tomar fotografías, grabar audio o grabar ' +
    'video, para apoyar el registro y el análisis de la investigación.\n\n' +
    'Usted decide por separado si autoriza cada uno de estos registros: puede aceptar ' +
    'unos y negar otros.\n\n' +
    'Negarse a cualquiera de ellos —o a todos— no afecta su participación en la ' +
    'encuesta ni los beneficios del proyecto. Si en algún momento durante la visita ' +
    'quiere que se detenga una grabación, basta con que lo diga.',
  rightsClause:
    'La Ley 1581 de 2012 le reconoce estos derechos sobre sus datos personales, y ' +
    'usted puede ejercerlos en cualquier momento y sin costo:\n\n' +
    '- Conocer qué datos suyos tenemos y cómo los hemos usado.\n' +
    '- Actualizarlos o corregirlos si están equivocados o incompletos.\n' +
    '- Pedir una copia de esta autorización.\n' +
    '- Revocar esta autorización y pedir que sus datos se eliminen.\n' +
    '- Presentar una queja ante la Superintendencia de Industria y Comercio si ' +
    'considera que sus derechos no se están respetando.\n\n' +
    'Para ejercer cualquiera de estos derechos, escriba al correo de contacto que ' +
    'aparece en este documento, o dígaselo directamente al encuestador que lo ' +
    'visitó.\n\n' +
    'Tenga en cuenta que si revoca la autorización, retiramos sus datos del estudio, ' +
    'pero los resultados agregados que ya se hayan publicado no se pueden deshacer ' +
    '—en esos resultados usted nunca aparece identificado.',
  responsibleEntity:
    'Instituto Tecnológico Metropolitano (ITM) — Proyecto SosAgro 4.C',
  contactEmail: 'maritzagil@itm.edu.co',
};

export async function seedConsentDocument(
  manager: EntityManager,
): Promise<void> {
  const repo = manager.getRepository(ConsentDocument);

  for (const doc of [CONSENT_DOCUMENT_V1, CONSENT_DOCUMENT_V1_1]) {
    const existing = await repo.findOne({ where: { version: doc.version } });

    if (existing) {
      console.log(
        `[seed] ConsentDocument versión "${doc.version}" ya existe. Se omite.`,
      );
      continue;
    }

    await repo.save(repo.create({ ...doc, status: 'draft' }));
    console.log(
      `[seed] ConsentDocument creado: versión ${doc.version} (draft — publicar manualmente).`,
    );
  }
}
