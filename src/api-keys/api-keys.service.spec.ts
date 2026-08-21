import * as crypto from 'crypto';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  beforeEach(() => {
    const fakeRepository = {} as never;
    const fakeUsersService = {} as never;
    const fakeConfigService = {
      get: (key: string) =>
        key === 'API_KEY_PEPPER' ? 'test-pepper' : undefined,
    } as never;

    service = new ApiKeysService(
      fakeRepository,
      fakeUsersService,
      fakeConfigService,
    );
  });

  it('throws at construction if API_KEY_PEPPER is missing', () => {
    const fakeConfigService = { get: () => undefined } as never;
    expect(
      () => new ApiKeysService({} as never, {} as never, fakeConfigService),
    ).toThrow('API_KEY_PEPPER is not configured');
  });

  describe('parseKey', () => {
    it('parses a well-formed key', () => {
      const parsed = service.parseKey('sosagro_sk_abcd1234_therestofthesecret');
      expect(parsed).toEqual({
        prefix: 'abcd1234',
        secret: 'therestofthesecret',
      });
    });

    it.each([
      // Regression: base64url alphabet includes "_", so a prefix generated
      // with crypto.randomBytes(6).toString('base64url') can legitimately
      // contain one. An indexOf('_')-based split would truncate the prefix
      // in these cases — the exact bug found during spec 48's implementation,
      // which only ever showed up as intermittent e2e flakiness.
      ['a_cd1234', 'therestofthesecret'],
      ['ab-d_234', 'therestofthesecret'],
      ['________', 'secretvalue'],
      ['abcd123_', 'secretvalue'], // "_" as the LAST prefix char, adjacent to the real separator
    ])(
      'parses a prefix containing "_" by fixed length, not by separator search (prefix=%s)',
      (prefix, secret) => {
        const raw = `sosagro_sk_${prefix}_${secret}`;
        const parsed = service.parseKey(raw);
        expect(parsed).toEqual({ prefix, secret });
      },
    );

    it('rejects a key without the sosagro_sk_ format prefix', () => {
      expect(service.parseKey('not-a-key')).toBeNull();
    });

    it('rejects a key with no secret after the prefix', () => {
      expect(service.parseKey('sosagro_sk_abcd1234_')).toBeNull();
    });

    it('rejects a key shorter than the fixed prefix length', () => {
      expect(service.parseKey('sosagro_sk_short')).toBeNull();
    });

    it('rejects a key where the separator is not at the expected fixed position', () => {
      // 7-char prefix instead of 8 — separator lands one position early.
      expect(
        service.parseKey('sosagro_sk_abcd123_therestofthesecret'),
      ).toBeNull();
    });
  });

  describe('validateKey', () => {
    it('returns null for a malformed key without querying the repository', async () => {
      const result = await service.validateKey('garbage');
      expect(result).toBeNull();
    });
  });

  describe('hashSecret (via create/validateKey round-trip contract)', () => {
    it('produces a deterministic sha256 of secret+pepper', () => {
      // hashSecret is private; assert the contract indirectly through the
      // same algorithm parseKey/validateKey rely on, to catch accidental
      // changes to the hashing scheme.
      const secret = 'some-secret-value';
      const expected = crypto
        .createHash('sha256')
        .update(secret + 'test-pepper')
        .digest('hex');
      const actual = (
        service as unknown as { hashSecret(s: string): string }
      ).hashSecret(secret);
      expect(actual).toBe(expected);
    });
  });
});
