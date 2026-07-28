import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CampaignSessionsService } from './campaign-sessions.service';
import { CampaignSession } from './entities/campaign-session.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { User } from 'src/users/entities/user.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { CreateCampaignSessionDto } from './dto/create-campaign-session.dto';

/**
 * Spec 49 — Bug C (backend): validación defensiva de `farmerId` / `userId`.
 *
 * Cubre los criterios de aceptación 10, 11 y 12 de
 * `spec/49_correccion_identidad_offline_agricultor_cultivos.md`.
 *
 * ARRANCA EN ROJO: hoy `create()` no inyecta ni consulta los repositorios de
 * `Farmer` y `User`. Pasa las referencias parciales (`{ id: dto.farmerId }`)
 * directo al `save()` y deja que la FK de Postgres sea la única defensa:
 *
 *   QueryFailedError: insert or update on table "campaign_sessions"
 *   violates foreign key constraint "FK_cf3caca4335425e4966807bf4fb"
 *
 * Eso produce un 500 sin manejar (Sentry NODE-NESTJS-3, 6 ocurrencias durante
 * el piloto) en vez de un 404 que el cliente móvil pueda usar para invalidar su
 * caché local y reintentar como agricultor nuevo.
 */

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const FARMER_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

describe('CampaignSessionsService.create — validación de FK (spec 49)', () => {
  let service: CampaignSessionsService;
  let sessionsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let campaignsRepository: { findOne: jest.Mock };
  let cropsRepository: { findBy: jest.Mock };
  let farmersRepository: { findOne: jest.Mock; exist?: jest.Mock };
  let usersRepository: { findOne: jest.Mock; exist?: jest.Mock };

  const dto = (
    overrides: Partial<CreateCampaignSessionDto> = {},
  ): CreateCampaignSessionDto =>
    ({ campaignId: CAMPAIGN_ID, ...overrides }) as CreateCampaignSessionDto;

  beforeEach(async () => {
    sessionsRepository = {
      create: jest.fn((partial: Record<string, unknown>) => partial),
      save: jest.fn((entity: Record<string, unknown>) =>
        Promise.resolve({ ...entity, sessionId: SESSION_ID }),
      ),
      // `create()` cierra devolviendo `this.findOne(saved.sessionId)`, que ordena
      // `session.campaign.steps` — de ahí la forma mínima del retorno.
      findOne: jest.fn(() =>
        Promise.resolve({
          sessionId: SESSION_ID,
          campaign: { campaignId: CAMPAIGN_ID, steps: [] },
        }),
      ),
      createQueryBuilder: jest.fn(),
    };
    campaignsRepository = {
      findOne: jest.fn(() => Promise.resolve({ campaignId: CAMPAIGN_ID })),
    };
    cropsRepository = { findBy: jest.fn(() => Promise.resolve([])) };
    // Por defecto, ambos existen.
    farmersRepository = {
      findOne: jest.fn(() => Promise.resolve({ id: FARMER_ID })),
    };
    usersRepository = {
      findOne: jest.fn(() => Promise.resolve({ userId: USER_ID })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignSessionsService,
        {
          provide: getRepositoryToken(CampaignSession),
          useValue: sessionsRepository,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: campaignsRepository,
        },
        { provide: getRepositoryToken(TypeOfCrop), useValue: cropsRepository },
        { provide: getRepositoryToken(Farmer), useValue: farmersRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Survey), useValue: { count: jest.fn() } },
      ],
    }).compile();

    service = module.get<CampaignSessionsService>(CampaignSessionsService);
  });

  // Criterio 10
  it('lanza NotFoundException("Farmer not found") si el farmerId no existe', async () => {
    farmersRepository.findOne.mockResolvedValue(null);

    await expect(service.create(dto({ farmerId: FARMER_ID }))).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.create(dto({ farmerId: FARMER_ID }))).rejects.toThrow(
      'Farmer not found',
    );
  });

  // Criterio 10 — el 500 de producción venía de que el save() se ejecutaba igual
  it('no intenta guardar la sesión si el farmerId no existe', async () => {
    farmersRepository.findOne.mockResolvedValue(null);

    await expect(service.create(dto({ farmerId: FARMER_ID }))).rejects.toThrow(
      NotFoundException,
    );
    expect(sessionsRepository.save).not.toHaveBeenCalled();
  });

  // Criterio 11
  it('lanza NotFoundException("User not found") si el userId no existe', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(service.create(dto({ userId: USER_ID }))).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.create(dto({ userId: USER_ID }))).rejects.toThrow(
      'User not found',
    );
  });

  it('no intenta guardar la sesión si el userId no existe', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(service.create(dto({ userId: USER_ID }))).rejects.toThrow(
      NotFoundException,
    );
    expect(sessionsRepository.save).not.toHaveBeenCalled();
  });

  // Criterio 12 — sin regresión: el camino feliz se comporta igual que hoy
  it('crea la sesión cuando campaignId, farmerId y userId son válidos', async () => {
    const result = await service.create(
      dto({ farmerId: FARMER_ID, userId: USER_ID }),
    );

    expect(sessionsRepository.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ sessionId: SESSION_ID }));
  });

  // Criterio 12 — ambos son opcionales en el DTO: sin ellos no hay nada que validar
  it('crea la sesión sin farmerId ni userId sin consultar sus repositorios', async () => {
    await service.create(dto());

    expect(farmersRepository.findOne).not.toHaveBeenCalled();
    expect(usersRepository.findOne).not.toHaveBeenCalled();
    expect(sessionsRepository.save).toHaveBeenCalledTimes(1);
  });

  // La validación de campaignId ya existía; este caso la fija como regresión.
  it('sigue lanzando NotFoundException("Campaign not found") si la campaña no existe', async () => {
    campaignsRepository.findOne.mockResolvedValue(null);

    await expect(service.create(dto({ farmerId: FARMER_ID }))).rejects.toThrow(
      'Campaign not found',
    );
    expect(sessionsRepository.save).not.toHaveBeenCalled();
  });
});
