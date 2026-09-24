import { catalogsForSystemField } from './metadata-catalogs';

describe('catalogsForSystemField', () => {
  it('farm.town solo admite municipios', () => {
    expect(catalogsForSystemField('farm.town')).toEqual(['town']);
  });

  it('farm.department solo admite departamentos', () => {
    expect(catalogsForSystemField('farm.department')).toEqual(['department']);
  });

  it('farm.mainCrop y crop.* solo admiten tipos de cultivo', () => {
    expect(catalogsForSystemField('farm.mainCrop')).toEqual(['crop']);
    expect(catalogsForSystemField('crop.canamo')).toEqual(['crop']);
  });

  it('sin systemField o con uno que no fija catálogo admite los cuatro', () => {
    for (const field of [undefined, null, '', '  ', 'farmer.name']) {
      expect(catalogsForSystemField(field)).toEqual([
        'department',
        'town',
        'crop',
        'actorType',
      ]);
    }
  });
});
