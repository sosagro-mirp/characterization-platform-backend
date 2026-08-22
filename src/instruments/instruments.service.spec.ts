import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { InstrumentsService } from './instruments.service';
import { Instrument } from './entities/instrument.entity';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { User } from 'src/users/entities/user.entity';
import { Town } from 'src/towns/entities/town.entity';

/**
 * Hotfix del 2026-08-22 — dos regresiones reales de producción introducidas
 * por el backfill de códigos del spec 43 (`BackfillInstrumentCodes`):
 *
 * 1. `findByCode('S1')`/`findByCode('S2')` (usados por `mobile/` y
 *    `frontend/` para el flujo de identificación S1/S2) empezaron a fallar:
 *    el backfill renombró esos instrumentos a `code: 'S1a'`/`'S1b'` para no
 *    chocar con el código de dashboard `'S2'` (un instrumento de contenido
 *    real, "Cultivos — Identificación de Cadenas"). Verificado en vivo
 *    contra producción: `GET /api/instruments/by-code/S1` devolvía 404, y
 *    `by-code/S2` devolvía el instrumento de dashboard equivocado.
 * 2. `findAll(excludeSystem: true)` usaba `code IS NULL` como señal de "no es
 *    instrumento de sistema" — válido cuando solo 3 instrumentos tenían
 *    `code`, roto desde que el backfill le puso `code` a los 36. El selector
 *    de instrumentos disponibles para armar una campaña habría quedado vacío.
 */
describe('InstrumentsService — hotfix códigos de sistema (2026-08-22)', () => {
  let service: InstrumentsService;
  let instrumentsRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    leftJoin: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    instrumentsRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    instrumentsRepository.createQueryBuilder.mockReturnValue(qb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstrumentsService,
        {
          provide: getRepositoryToken(Instrument),
          useValue: instrumentsRepository,
        },
        { provide: getRepositoryToken(ActorType), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Town), useValue: {} },
      ],
    }).compile();

    service = module.get<InstrumentsService>(InstrumentsService);
  });

  describe('findByCode — alias legacy S1/S2', () => {
    it("resuelve el código legacy 'S1' contra el instrumento con code 'S1a'", async () => {
      instrumentsRepository.findOne.mockResolvedValue({
        instrumentId: 'inst-s1a',
        name: 'S1a: Identificación del encuestado/propietario/productor',
      });

      const result = await service.findByCode('S1');

      expect(instrumentsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'S1a' } }),
      );
      expect(result.instrumentId).toBe('inst-s1a');
    });

    it("resuelve el código legacy 'S2' contra el instrumento con code 'S1b', no el de dashboard", async () => {
      instrumentsRepository.findOne.mockResolvedValue({
        instrumentId: 'inst-s1b',
        name: 'S1b: Identificación de la unidad productiva',
      });

      const result = await service.findByCode('S2');

      expect(instrumentsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'S1b' } }),
      );
      expect(result.instrumentId).toBe('inst-s1b');
    });

    it('un código de dashboard real (no legacy) pasa sin alias', async () => {
      instrumentsRepository.findOne.mockResolvedValue({
        instrumentId: 'inst-s3',
        name: 'S3: Manejo del Cultivo, Suelo y Condiciones Ambientales',
      });

      await service.findByCode('S3');

      expect(instrumentsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'S3' } }),
      );
    });

    it('lanza 404 con el código original (no el alias) si no existe', async () => {
      instrumentsRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCode('S1')).rejects.toThrow(
        new NotFoundException("Instrument with code 'S1' not found"),
      );
    });
  });

  describe('findAll(excludeSystem) — filtra por lista de códigos de sistema, no por code != null', () => {
    it('con excludeSystem=true, filtra excluyendo S1a/S1b/S_DCU, no cualquier code', async () => {
      await service.findAll(true);

      expect(qb.where).toHaveBeenCalledWith(
        'instrument.code IS NULL OR instrument.code NOT IN (:...codes)',
        { codes: ['S1a', 'S1b', 'S_DCU'] },
      );
    });

    it('sin excludeSystem, no aplica ningún filtro por código', async () => {
      await service.findAll(false);

      expect(qb.where).not.toHaveBeenCalled();
    });
  });
});
