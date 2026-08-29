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
  select: { farm: { crops: { cropId: boolean; name: boolean } } };
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

  describe('search', () => {
    it('includes farm.crops in the relations and select', async () => {
      farmersRepository.find.mockResolvedValue([]);

      await service.search('santiago');

      const callArgs = farmersRepository.find.mock.calls[0][0];
      expect(callArgs.relations).toContain('farm.crops');
      expect(callArgs.select.farm.crops).toEqual({ cropId: true, name: true });
    });

    it('returns the crops already associated with the farm', async () => {
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
            crops: [{ cropId: 'crop-1', name: 'Café' }],
          },
        },
      ]);

      const result = await service.search('santiago');

      expect(result[0].farm.crops).toEqual([
        { cropId: 'crop-1', name: 'Café' },
      ]);
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
            crops: [],
          },
        },
      ]);

      const result = await service.search('old');

      expect(result[0].farm.crops).toEqual([]);
    });
  });
});
