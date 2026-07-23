import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FarmersService } from './farmers.service';
import { Farmer } from './entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';

describe('FarmersService', () => {
  let service: FarmersService;
  let farmersRepository: { find: jest.Mock };

  beforeEach(async () => {
    farmersRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmersService,
        { provide: getRepositoryToken(Farmer), useValue: farmersRepository },
        { provide: getRepositoryToken(Farm), useValue: {} },
        { provide: getRepositoryToken(Town), useValue: {} },
      ],
    }).compile();

    service = module.get<FarmersService>(FarmersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

      expect(result[0].farm.crops).toEqual([{ cropId: 'crop-1', name: 'Café' }]);
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
