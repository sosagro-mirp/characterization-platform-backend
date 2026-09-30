import { join } from 'path';
import { DataSource } from 'typeorm';
import { Farm } from 'src/farms/entities/farm.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { FarmerDocumentCollision } from 'src/farmers/entities/farmer-document-collision.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { User } from 'src/users/entities/user.entity';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { ConsentRecord } from 'src/consents/entities/consent-record.entity';
import { ConsentDocument } from 'src/consents/entities/consent-document.entity';
import { ConsentDocumentsService } from 'src/consents/consent-documents.service';
import { ConsentRecordsService } from 'src/consents/consent-records.service';
import { SurveysService } from 'src/surveys/surveys.service';

export type CliFlags = Record<string, string | boolean>;

/** Mismo parser que `instrument-sync/cli.ts`: `--clave valor` o `--bandera`. */
export function parseArgs(argv: string[]): {
  command: string | undefined;
  flags: CliFlags;
} {
  const [command, ...rest] = argv;
  const flags: CliFlags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

/** Misma heurística que `instrument-sync`: las ramas de Neon también cuentan. */
export function looksLikeProduction(url: string): boolean {
  return url.includes('neon.tech') || url.includes('railway');
}

/** Host y base de datos, sin credenciales, para dejar constancia en reportes y logs. */
export function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'destino no interpretable';
  }
}

/**
 * Guarda de escritura contra producción: exige el flag y que quien opera
 * escriba el número exacto de envíos a procesar (spec 93, Alcance D). Lanza
 * con el motivo; no devuelve nada si se puede continuar.
 */
export function assertWriteAllowed(params: {
  url: string;
  flags: CliFlags;
  expectedCount: number;
  typedCount: string | null;
  /** «procesar» (apply) o «revertir» (revert). */
  verb?: string;
}): void {
  const verb = params.verb ?? 'procesar';
  if (!looksLikeProduction(params.url)) return;
  if (!params.flags['production-target-confirm']) {
    throw new Error(
      'El destino parece producción (o una rama de Neon). Revise el alcance y repita el comando con ' +
        '--production-target-confirm solo después de confirmarlo explícitamente con el usuario.',
    );
  }
  if (params.typedCount === null || params.typedCount.trim() === '') {
    throw new Error(
      `Contra producción debe escribirse el número de envíos a ${verb} (${params.expectedCount}).`,
    );
  }
  if (params.typedCount.trim() !== String(params.expectedCount)) {
    throw new Error(
      `El número escrito (${params.typedCount.trim()}) no coincide con los envíos a ${verb} (${params.expectedCount}). No se escribió nada.`,
    );
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/**
 * Conexión explícita —nunca `DATABASE_URL`— con las entidades que necesita
 * `SurveysService`. Sin contexto de Nest ni servidor HTTP.
 */
export function connect(url: string): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    // Las entidades se relacionan entre sí: se cargan todas, no solo las usadas.
    entities: [join(__dirname, '../../**/*.entity.{ts,js}')],
    synchronize: false,
    logging: false,
  });
}

/** Mismo servicio y misma lógica que la API: la CLI no reimplementa el procesado. */
export function createSurveysService(ds: DataSource): SurveysService {
  const consentDocuments = new ConsentDocumentsService(
    ds.getRepository(ConsentDocument),
  );
  const consentRecords = new ConsentRecordsService(
    ds.getRepository(ConsentRecord),
    consentDocuments,
  );
  return new SurveysService(
    ds.getRepository(Survey),
    ds.getRepository(Instrument),
    ds.getRepository(Farmer),
    ds.getRepository(Farm),
    ds.getRepository(User),
    ds.getRepository(ActorType),
    ds.getRepository(Department),
    ds.getRepository(Town),
    ds.getRepository(TypeOfCrop),
    ds.getRepository(CampaignSession),
    ds.getRepository(Response),
    ds.getRepository(FarmerDocumentCollision),
    consentRecords,
  );
}
