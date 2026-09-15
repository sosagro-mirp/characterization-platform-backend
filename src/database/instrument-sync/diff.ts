import { stableStringify } from './hash';
import {
  InstrumentManifest,
  ManifestInstrument,
  ManifestOption,
  ManifestQuestion,
  ManifestSection,
} from './types';

/**
 * Spec 84, Fase 3 — índices por UUID sobre un manifiesto, para poder
 * comparar la misma entidad entre `base`/`desired`/`current` sin importar
 * el orden en que aparezca en cada uno.
 */
export interface FlatManifest {
  instruments: Map<string, ManifestInstrument>;
  sections: Map<string, { section: ManifestSection; instrumentId: string }>;
  questions: Map<
    string,
    { question: ManifestQuestion; sectionId: string; instrumentId: string }
  >;
  options: Map<
    string,
    { option: ManifestOption; questionId: string; instrumentId: string }
  >;
}

export function flatten(manifest: InstrumentManifest): FlatManifest {
  const flat: FlatManifest = {
    instruments: new Map(),
    sections: new Map(),
    questions: new Map(),
    options: new Map(),
  };
  for (const instrument of manifest.instruments) {
    flat.instruments.set(instrument.instrumentId, instrument);
    for (const section of instrument.sections) {
      flat.sections.set(section.sectionId, {
        section,
        instrumentId: instrument.instrumentId,
      });
      for (const question of section.questions) {
        flat.questions.set(question.questionId, {
          question,
          sectionId: section.sectionId,
          instrumentId: instrument.instrumentId,
        });
        for (const option of question.options) {
          flat.options.set(option.optionId, {
            option,
            questionId: question.questionId,
            instrumentId: instrument.instrumentId,
          });
        }
      }
    }
  }
  return flat;
}

/** Contenido relevante de un instrumento, ignorando lo derivado (hash, sections). */
function instrumentContent(i: ManifestInstrument) {
  const {
    instrumentId: _instrumentId,
    hash: _hash,
    sections: _sections,
    ...rest
  } = i;
  return rest;
}

/**
 * `archived_at` es `timestamp` sin zona. Los manifiestos anteriores al
 * 2026-09-15 lo traen como ISO con `Z` y milisegundos
 * (`2026-09-14T17:23:04.886Z`); los nuevos, como texto sin zona con
 * microsegundos (`2026-09-14T17:23:04.886000`). Se comparan por los mismos
 * dígitos, que es lo que la columna guarda.
 */
export function normalizeArchivedAt(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?/.exec(
    value,
  );
  if (!match) return value;
  const fraction = (match[3] ?? '').padEnd(6, '0').slice(0, 6);
  return `${match[1]}T${match[2]}.${fraction}`;
}

/** Contenido relevante de una pregunta, ignorando lo derivado (hash, responseCount, options). */
function questionContent(q: ManifestQuestion) {
  const {
    questionId: _questionId,
    hash: _hash,
    responseCount: _responseCount,
    options: _options,
    ...rest
  } = q;
  return { ...rest, archivedAt: normalizeArchivedAt(rest.archivedAt) };
}

function optionContent(o: ManifestOption) {
  const {
    optionId: _optionId,
    hash: _hash,
    responseCount: _responseCount,
    ...rest
  } = o;
  return { ...rest, archivedAt: normalizeArchivedAt(rest.archivedAt) };
}

function sectionContent(s: ManifestSection) {
  const { sectionId: _sectionId, questions: _questions, ...rest } = s;
  return rest;
}

/** true si dos valores de contenido (ya sin campos derivados) son iguales. */
export function contentEqual<T>(a: T, b: T): boolean {
  return stableStringify(a) === stableStringify(b);
}

export const contentOf = {
  instrument: instrumentContent,
  section: sectionContent,
  question: questionContent,
  option: optionContent,
};
