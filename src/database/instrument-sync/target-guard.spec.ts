import { looksLikeProduction } from './target-guard';

const DEV =
  'postgresql://u:p@ep-dev-123.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD =
  'postgresql://u:p@ep-prod-456-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

describe('looksLikeProduction', () => {
  it('trata cualquier Neon como producción si no hay hosts de desarrollo declarados', () => {
    expect(looksLikeProduction(DEV, undefined)).toBe(true);
    expect(looksLikeProduction(DEV, '')).toBe(true);
  });

  it('permite el host de Neon declarado como desarrollo', () => {
    expect(
      looksLikeProduction(DEV, 'ep-dev-123.c-13.us-east-1.aws.neon.tech'),
    ).toBe(false);
  });

  it('sigue bloqueando producción aunque haya otro host declarado', () => {
    expect(
      looksLikeProduction(PROD, 'ep-dev-123.c-13.us-east-1.aws.neon.tech'),
    ).toBe(true);
  });

  it('no acepta coincidencias parciales del host', () => {
    expect(looksLikeProduction(DEV, 'ep-dev-123')).toBe(true);
  });

  it('trata Railway como producción', () => {
    expect(looksLikeProduction('postgresql://u:p@x.railway.app/db', '')).toBe(
      true,
    );
  });

  it('no marca bases locales', () => {
    expect(
      looksLikeProduction('postgresql://u:p@localhost:5433/sos-agro', ''),
    ).toBe(false);
  });
});
