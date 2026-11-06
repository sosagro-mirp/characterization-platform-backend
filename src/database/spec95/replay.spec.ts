import { DataSource } from 'typeorm';
import { parseReplayArgs, runExtractionReplay } from './replay';

describe('extraction:replay — --include-done (spec 97, Fase 10)', () => {
  describe('parseReplayArgs', () => {
    it('sin --include-done mantiene el comportamiento previo', () => {
      expect(parseReplayArgs(['--dry-run'])).toEqual({
        mode: 'dry-run',
        surveyIds: undefined,
        includeDone: false,
      });
    });

    it('acepta --include-done junto a --survey-ids', () => {
      expect(
        parseReplayArgs(['--apply', '--include-done', '--survey-ids=a, b,']),
      ).toEqual({ mode: 'apply', surveyIds: ['a', 'b'], includeDone: true });
    });

    it('rechaza --include-done sin --survey-ids', () => {
      expect(() => parseReplayArgs(['--dry-run', '--include-done'])).toThrow(
        '--include-done exige --survey-ids',
      );
    });

    it('exige exactamente uno de --dry-run o --apply', () => {
      expect(() => parseReplayArgs([])).toThrow('Indique exactamente una');
      expect(() => parseReplayArgs(['--dry-run', '--apply'])).toThrow(
        'Indique exactamente una',
      );
    });
  });

  describe('runExtractionReplay', () => {
    function fakeDataSource() {
      const query = jest.fn().mockResolvedValue([]);
      const queryRunner = {
        connect: jest.fn(),
        release: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        manager: {},
      };
      const ds = {
        query,
        getRepository: jest.fn().mockReturnValue({}),
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource;
      return { ds, query };
    }

    it('rechaza includeDone sin surveyIds antes de consultar', async () => {
      const { ds, query } = fakeDataSource();
      await expect(
        runExtractionReplay(ds, { mode: 'dry-run', includeDone: true }),
      ).rejects.toThrow('includeDone exige surveyIds');
      expect(query).not.toHaveBeenCalled();
    });

    it('pasa includeDone a la selección y la amplía a done/not_applicable', async () => {
      const { ds, query } = fakeDataSource();
      await runExtractionReplay(ds, {
        mode: 'dry-run',
        surveyIds: ['00000000-0000-4000-8000-000000000001'],
        includeDone: true,
      });
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain(
        "$2::boolean AND s.extraction_status IN ('done', 'not_applicable')",
      );
      expect(params).toEqual([['00000000-0000-4000-8000-000000000001'], true]);
    });

    it('sin includeDone la selección no toma encuestas ya extraídas', async () => {
      const { ds, query } = fakeDataSource();
      await runExtractionReplay(ds, { mode: 'dry-run' });
      const [, params] = query.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual([null, false]);
    });
  });
});
