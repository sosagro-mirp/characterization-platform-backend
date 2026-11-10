import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FarmersService } from './farmers.service';
import { Farmer } from './entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { ConsentRecordsService } from '../consents/consent-records.service';

interface FindCallArgs {
  relations: string[];
  select: {
    farm: { farmCrops: { crop: { cropId: boolean; name: boolean } } };
  };
}

describe('FarmersService', () => {
  let service: FarmersService;
  let farmersRepository: {
    find: jest.Mock<Promise<unknown[]>, [FindCallArgs]>;
  };
  let consentRecordsService: {
    getPendingConsentMap: jest.Mock<Promise<Map<string, boolean>>, [string[]]>;
  };

  beforeEach(async () => {
    farmersRepository = { find: jest.fn<Promise<unknown[]>, [FindCallArgs]>() };
    consentRecordsService = {
      getPendingConsentMap: jest
        .fn<Promise<Map<string, boolean>>, [string[]]>()
        .mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmersService,
        { provide: getRepositoryToken(Farmer), useValue: farmersRepository },
        { provide: getRepositoryToken(Farm), useValue: {} },
        { provide: getRepositoryToken(Town), useValue: {} },
        { provide: getRepositoryToken(CampaignSession), useValue: {} },
        { provide: getRepositoryToken(Survey), useValue: {} },
        { provide: getRepositoryToken(FarmerDocumentCollision), useValue: {} },
        { provide: ConsentRecordsService, useValue: consentRecordsService },
      ],
    }).compile();

    service = module.get<FarmersService>(FarmersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Fase 10 (cambio de alcance 2026-08-28, spec 78) — cada agricultor del
  // listado lleva `hasPendingConsent`, sin depender de N+1 llamadas.
  describe('findAll — hasPendingConsent (spec 78, Fase 10)', () => {
    it('marca pendiente a un agricultor sin consentimiento vigente', async () => {
      farmersRepository.find.mockResolvedValue([{ id: 'farmer-1' }]);
      consentRecordsService.getPendingConsentMap.mockResolvedValue(
        new Map([['farmer-1', true]]),
      );

      const [farmer] = await service.findAll();

      expect(consentRecordsService.getPendingConsentMap).toHaveBeenCalledWith([
        'farmer-1',
      ]);
      expect(farmer.hasPendingConsent).toBe(true);
    });

    it('no marca pendiente a un agricultor con consentimiento vigente', async () => {
      farmersRepository.find.mockResolvedValue([{ id: 'farmer-1' }]);
      consentRecordsService.getPendingConsentMap.mockResolvedValue(
        new Map([['farmer-1', false]]),
      );

      const [farmer] = await service.findAll();

      expect(farmer.hasPendingConsent).toBe(false);
    });

    it('peca de marcar pendiente si el mapa no trae el agricultor', async () => {
      farmersRepository.find.mockResolvedValue([{ id: 'farmer-1' }]);
      consentRecordsService.getPendingConsentMap.mockResolvedValue(new Map());

      const [farmer] = await service.findAll();

      expect(farmer.hasPendingConsent).toBe(true);
    });
  });

  // Spec 94 — `Farm.crops` ya no es una relación: se DERIVA de los cultivos de
  // finca activos (`farmCrops`). Los casos de abajo conservan lo que verificaban
  // (cultivos de la finca en `search`, sin romper si no hay) sobre el modelo nuevo.
  describe('search', () => {
    it('carga los cultivos de finca (farm.farmCrops) y los vínculos en relations y select', async () => {
      farmersRepository.find.mockResolvedValue([]);

      await service.search('santiago');

      const callArgs = farmersRepository.find.mock.calls[0][0];
      expect(callArgs.relations).toContain('farm.farmCrops');
      expect(callArgs.relations).toContain('farmLinks.farm.farmCrops');
      expect(callArgs.select.farm.farmCrops.crop).toEqual({
        cropId: true,
        name: true,
      });
      // Endpoint público: no se carga la vereda de las fincas vinculadas.
      const select = callArgs.select as unknown as {
        farmLinks: { farm: Record<string, unknown> };
      };
      expect(select.farmLinks.farm.vereda).toBeUndefined();
    });

    it('returns the crops already associated with the farm (derived from active farm crops)', async () => {
      farmersRepository.find.mockResolvedValue([
        {
          id: 'farmer-1',
          name: 'Santiago',
          documentId: '123',
          phone: null,
          farm: {
            farmId: 'farm-1',
            name: 'Finca El Cafetal',
            town: { townId: 'town-1', name: 'Medellín' },
            farmCrops: [
              {
                farmCropId: 'fc-1',
                cropId: 'crop-1',
                archivedAt: null,
                crop: { cropId: 'crop-1', name: 'Café' },
              },
              {
                farmCropId: 'fc-2',
                cropId: 'crop-2',
                archivedAt: new Date('2026-01-01'),
                crop: { cropId: 'crop-2', name: 'Cacao' },
              },
            ],
          },
          farmLinks: [],
        },
      ]);

      const result = await service.search('santiago');

      expect(result[0].farm?.crops).toEqual([
        { cropId: 'crop-1', name: 'Café' },
      ]);
      expect(result[0].farm && 'farmCrops' in result[0].farm).toBe(false);
    });

    it('returns an empty crops array without error when the farm has none', async () => {
      farmersRepository.find.mockResolvedValue([
        {
          id: 'farmer-2',
          name: 'Old Farmer',
          documentId: '456',
          phone: null,
          farm: {
            farmId: 'farm-2',
            name: 'Finca Sin Cultivo',
            town: null,
            farmCrops: [],
          },
        },
      ]);

      const result = await service.search('old');

      expect(result[0].farm?.crops).toEqual([]);
    });

    it('agrega farms[] con rol, principal y cultivos de finca, y mantiene farm', async () => {
      const farm = {
        farmId: 'farm-1',
        name: 'Finca El Cafetal',
        vereda: 'La Palma',
        town: { townId: 'town-1', name: 'Medellín' },
        farmCrops: [
          {
            farmCropId: 'fc-1',
            cropId: 'crop-1',
            archivedAt: null,
            crop: { cropId: 'crop-1', name: 'Café' },
          },
        ],
      };
      farmersRepository.find.mockResolvedValue([
        {
          id: 'farmer-1',
          name: 'Santiago',
          documentId: '123',
          phone: null,
          farm,
          farmLinks: [
            {
              role: 'owner',
              isPrimary: true,
              createdAt: new Date('2026-01-01'),
              farm,
            },
          ],
        },
      ]);

      const [result] = await service.search('santiago');

      expect(result.farm?.farmId).toBe('farm-1');
      expect(result.farms).toEqual([
        {
          farmId: 'farm-1',
          name: 'Finca El Cafetal',
          town: { townId: 'town-1', name: 'Medellín' },
          role: 'owner',
          isPrimary: true,
          crops: [{ farmCropId: 'fc-1', cropId: 'crop-1', name: 'Café' }],
        },
      ]);
      expect('farmLinks' in result).toBe(false);
      expect(result.farms?.[0] && 'vereda' in result.farms[0]).toBe(false);
    });
  });
});
