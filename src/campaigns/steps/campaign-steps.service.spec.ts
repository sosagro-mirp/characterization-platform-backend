import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CampaignStepsService } from './campaign-steps.service';
import { Campaign } from '../entities/campaign.entity';
import { CampaignStep } from '../entities/campaign-step.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';

/**
 * Hotfix del 2026-08-22 — regresión real de producción introducida por el
 * backfill de códigos del spec 43 (`BackfillInstrumentCodes`).
 *
 * El guard "instrumento de sistema no puede ser paso de campaña" (spec 25)
 * usaba `instrument.code != null`, válido cuando solo 3 instrumentos tenían
 * `code`. El backfill del spec 43 le puso `code` a los 36 instrumentos —
 * el guard empezó a rechazar CUALQUIER instrumento, incluidos los de
 * contenido real. Verificado en vivo contra producción antes del fix:
 * `POST /api/campaigns/:id/steps` con un instrumento de contenido real (S3)
 * devolvía 400 "System instruments (S1, S2, etc.) cannot be added as
 * campaign steps".
 */
describe('CampaignStepsService — hotfix guard de instrumentos de sistema (2026-08-22)', () => {
  let service: CampaignStepsService;
  let campaignsRepository: { findOne: jest.Mock };
  let stepsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let instrumentsRepository: { findOne: jest.Mock };

  const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const campaign = { campaignId: CAMPAIGN_ID, name: 'TEST' };

  const instrumentoDeContenido = {
    instrumentId: 'inst-s3',
    name: 'S3: Manejo del Cultivo, Suelo y Condiciones Ambientales',
    code: 'S3', // código de dashboard (spec 43) — NO es instrumento de sistema
  };

  const instrumentoDeSistemaS1a = {
    instrumentId: 'inst-s1a',
    name: 'S1a: Identificación del encuestado/propietario/productor',
    code: 'S1a',
  };

  beforeEach(async () => {
    campaignsRepository = { findOne: jest.fn().mockResolvedValue(campaign) };
    stepsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null), // sin choque de `order`
      create: jest.fn().mockImplementation((v: unknown) => v),
      save: jest.fn().mockImplementation((v: unknown) => Promise.resolve(v)),
      createQueryBuilder: jest.fn(),
    };
    instrumentsRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignStepsService,
        {
          provide: getRepositoryToken(Campaign),
          useValue: campaignsRepository,
        },
        {
          provide: getRepositoryToken(CampaignStep),
          useValue: stepsRepository,
        },
        {
          provide: getRepositoryToken(Instrument),
          useValue: instrumentsRepository,
        },
      ],
    }).compile();

    service = module.get<CampaignStepsService>(CampaignStepsService);

    // findOne() interno (usado al final de create()) — evita depender de su detalle.
    jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
  });

  describe('create — acepta instrumentos de contenido con código de dashboard', () => {
    it('un instrumento con code de dashboard (ej. S3) SÍ puede ser paso de campaña', async () => {
      instrumentsRepository.findOne.mockResolvedValue(instrumentoDeContenido);

      await expect(
        service.create(CAMPAIGN_ID, { instrumentId: 'inst-s3', order: 1 }),
      ).resolves.not.toThrow();

      expect(stepsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ instrument: instrumentoDeContenido }),
      );
    });

    it('un instrumento de sistema (S1a) sigue rechazado', async () => {
      instrumentsRepository.findOne.mockResolvedValue(instrumentoDeSistemaS1a);

      await expect(
        service.create(CAMPAIGN_ID, { instrumentId: 'inst-s1a', order: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update — mismo guard corregido', () => {
    it('permite cambiar el paso a un instrumento de contenido con código de dashboard', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        stepId: 'step-1',
        order: 1,
      } as never);
      instrumentsRepository.findOne.mockResolvedValue(instrumentoDeContenido);

      await expect(
        service.update(CAMPAIGN_ID, 'step-1', { instrumentId: 'inst-s3' }),
      ).resolves.not.toThrow();
    });

    it('rechaza cambiar el paso a un instrumento de sistema', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        stepId: 'step-1',
        order: 1,
      } as never);
      instrumentsRepository.findOne.mockResolvedValue(instrumentoDeSistemaS1a);

      await expect(
        service.update(CAMPAIGN_ID, 'step-1', { instrumentId: 'inst-s1a' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
