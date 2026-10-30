import {
  canonicalKey,
  isSelectable,
  keysFor,
  resolveSystemField,
  SYSTEM_FIELDS,
} from './system-field-registry';
import {
  assertAssignableSystemField,
  assertTypeCompatible,
} from './system-field-validation';

describe('system-field-registry', () => {
  it('no repite claves ni alias', () => {
    const all = SYSTEM_FIELDS.flatMap((d) => [d.key, ...d.aliases]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('resuelve alias a la clave canónica', () => {
    expect(canonicalKey('farm.mainCrop')).toBe('farm.crops');
    expect(canonicalKey('crop.canamo')).toBe('farm.hasCrop.canamo');
    expect(canonicalKey(' farmer.name ')).toBe('farmer.name');
    expect(canonicalKey('foo.bar')).toBeNull();
    expect(canonicalKey(null)).toBeNull();
  });

  it('keysFor devuelve la canónica y sus alias', () => {
    expect(keysFor('farm.mainCrop')).toEqual(['farm.crops', 'farm.mainCrop']);
    expect(keysFor('farm.vereda')).toEqual(['farm.vereda']);
    expect(keysFor('nope')).toEqual([]);
  });

  it('las claves de rol en desuso son legacy y no seleccionables', () => {
    const def = resolveSystemField('farmer.isRespondent');
    expect(def?.status).toBe('legacy');
    expect(isSelectable(def!)).toBe(false);
    expect(isSelectable(resolveSystemField('farm.location')!)).toBe(true);
  });

  it('los destinos de selección múltiple admiten multiple_choice y repetirse', () => {
    for (const key of [
      'farm.mainAccessType',
      'farm.waterSourceType',
      'farm.electricitySourceType',
    ]) {
      const def = resolveSystemField(key)!;
      expect(def.multiValue).toBe(true);
      expect(def.questionTypes).toContain('multiple_choice');
    }
  });

  describe('validación', () => {
    it('rechaza claves desconocidas, legacy e incompatibles con códigos estables', () => {
      const codeOf = (fn: () => unknown) => {
        try {
          fn();
        } catch (e) {
          return (e as { getResponse: () => { code: string } }).getResponse()
            .code;
        }
        return null;
      };
      expect(
        codeOf(() => assertAssignableSystemField('foo.bar', 'open_text')),
      ).toBe('SYSTEM_FIELD_UNKNOWN');
      expect(
        codeOf(() =>
          assertAssignableSystemField('farmer.isRespondent', 'yes_no'),
        ),
      ).toBe('SYSTEM_FIELD_LEGACY');
      expect(
        codeOf(() => assertAssignableSystemField('farm.area', 'yes_no')),
      ).toBe('SYSTEM_FIELD_TYPE_MISMATCH');
    });

    it('acepta una legacy sin cambios y normaliza el alias', () => {
      expect(
        assertAssignableSystemField('farmer.isRespondent', 'yes_no', {
          unchanged: true,
        }).key,
      ).toBe('farmer.isRespondent');
      expect(
        assertAssignableSystemField('farm.mainCrop', 'multiple_choice').key,
      ).toBe('farm.crops');
    });

    it('assertTypeCompatible valida solo el tipo', () => {
      expect(() =>
        assertTypeCompatible(
          resolveSystemField('farm.area')!,
          'numeric_with_unit',
        ),
      ).not.toThrow();
    });
  });
});
