import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FarmPlotsService } from './farm-plots.service';
import { FarmPlot } from './entities/farm-plot.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { CreateFarmPlotDto } from './dto/create-farm-plot.dto';

/**
 * Spec 29 — Captura de polígonos GPS para lotes de finca.
 *
 * Escrito retroactivamente (2026-08-21): la implementación ya existía sin
 * ninguna prueba, hallazgo M-2 de `@reviewer`
 * (docs/reports/auditorias/29-auditoria-backend-development-merges-spec29-53-70.md).
 */

const FARM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARM_PLOT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_FARM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const POLYGON = {
  points: [
    { lat: 6.25184, lng: -75.56359 },
    { lat: 6.252, lng: -75.5637 },
    { lat: 6.2521, lng: -75.5634 },
  ],
};

describe('FarmPlotsService', () => {
  let service: FarmPlotsService;
  let farmPlotsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let farmsRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    farmPlotsRepository = {
      create: jest.fn((partial: Record<string, unknown>) => partial),
      save: jest.fn((entity: Record<string, unknown>) =>
        Promise.resolve({ farmPlotId: FARM_PLOT_ID, ...entity }),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn((entity: Record<string, unknown>) =>
        Promise.resolve(entity),
      ),
    };
    farmsRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmPlotsService,
        {
          provide: getRepositoryToken(FarmPlot),
          useValue: farmPlotsRepository,
        },
        { provide: getRepositoryToken(Farm), useValue: farmsRepository },
      ],
    }).compile();

    service = module.get<FarmPlotsService>(FarmPlotsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateFarmPlotDto = {
      farmId: FARM_ID,
      name: 'Lote cafetero norte',
      description: 'Zona de café arábigo',
      area: 2.5,
      capturedOffline: true,
      polygon: POLYGON,
    };

    it('rechaza con 404 si la finca no existe', async () => {
      farmsRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(farmPlotsRepository.create).not.toHaveBeenCalled();
    });

    it('crea el lote asociado a la finca encontrada, con todos los campos', async () => {
      const farm = { farmId: FARM_ID };
      farmsRepository.findOne.mockResolvedValue(farm);

      const result = await service.create(dto);

      expect(farmPlotsRepository.create).toHaveBeenCalledWith({
        name: dto.name,
        description: dto.description,
        area: dto.area,
        capturedOffline: true,
        polygon: dto.polygon,
        farm,
      });
      expect(farmPlotsRepository.save).toHaveBeenCalled();
      expect(result.farmPlotId).toBe(FARM_PLOT_ID);
    });

    it('usa defaults (capturedOffline: false, resto null) cuando el body los omite', async () => {
      farmsRepository.findOne.mockResolvedValue({ farmId: FARM_ID });

      await service.create({ farmId: FARM_ID, name: 'Lote mínimo' });

      expect(farmPlotsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          area: null,
          capturedOffline: false,
          polygon: null,
        }),
      );
    });
  });

  describe('findByFarm', () => {
    it('rechaza con 404 si la finca no existe', async () => {
      farmsRepository.findOne.mockResolvedValue(null);

      await expect(service.findByFarm(FARM_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('devuelve los lotes de la finca ordenados por fecha de creación descendente', async () => {
      farmsRepository.findOne.mockResolvedValue({ farmId: FARM_ID });
      farmPlotsRepository.find.mockResolvedValue([
        { farmPlotId: FARM_PLOT_ID },
      ]);

      const result = await service.findByFarm(FARM_ID);

      expect(farmPlotsRepository.find).toHaveBeenCalledWith({
        where: { farm: { farmId: FARM_ID } },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('rechaza con 404 si el lote no existe', async () => {
      farmPlotsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(FARM_PLOT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('devuelve el lote con la relación farm cargada', async () => {
      const plot = { farmPlotId: FARM_PLOT_ID, farm: { farmId: FARM_ID } };
      farmPlotsRepository.findOne.mockResolvedValue(plot);

      const result = await service.findOne(FARM_PLOT_ID);

      expect(farmPlotsRepository.findOne).toHaveBeenCalledWith({
        where: { farmPlotId: FARM_PLOT_ID },
        relations: ['farm'],
      });
      expect(result).toBe(plot);
    });
  });

  describe('update', () => {
    it('rechaza con 404 si el lote no existe (propaga desde findOne)', async () => {
      farmPlotsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(FARM_PLOT_ID, { name: 'Nuevo nombre' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('actualiza solo los campos presentes en el DTO (parcial)', async () => {
      const plot = {
        farmPlotId: FARM_PLOT_ID,
        name: 'Nombre viejo',
        description: 'Descripción vieja',
        area: 1,
        capturedOffline: false,
        polygon: null,
        farm: { farmId: FARM_ID },
      };
      farmPlotsRepository.findOne.mockResolvedValue(plot);

      await service.update(FARM_PLOT_ID, { name: 'Nombre nuevo' });

      expect(farmPlotsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nombre nuevo',
          description: 'Descripción vieja', // sin tocar
          area: 1, // sin tocar
        }),
      );
    });

    it('rechaza con 404 si se reasigna a una finca que no existe', async () => {
      const plot = {
        farmPlotId: FARM_PLOT_ID,
        farm: { farmId: FARM_ID },
      };
      farmPlotsRepository.findOne.mockResolvedValue(plot);
      farmsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(FARM_PLOT_ID, { farmId: OTHER_FARM_ID }),
      ).rejects.toThrow(NotFoundException);
    });

    it('reasigna la finca cuando farmId cambia y la nueva finca existe', async () => {
      const plot = {
        farmPlotId: FARM_PLOT_ID,
        farm: { farmId: FARM_ID },
      };
      const newFarm = { farmId: OTHER_FARM_ID };
      farmPlotsRepository.findOne.mockResolvedValue(plot);
      farmsRepository.findOne.mockResolvedValue(newFarm);

      await service.update(FARM_PLOT_ID, { farmId: OTHER_FARM_ID });

      expect(farmPlotsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ farm: newFarm }),
      );
    });

    it('no vuelve a buscar la finca si farmId no cambia', async () => {
      const plot = {
        farmPlotId: FARM_PLOT_ID,
        farm: { farmId: FARM_ID },
      };
      farmPlotsRepository.findOne.mockResolvedValue(plot);

      await service.update(FARM_PLOT_ID, { farmId: FARM_ID, name: 'X' });

      expect(farmsRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rechaza con 404 si el lote no existe (propaga desde findOne)', async () => {
      farmPlotsRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(FARM_PLOT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('elimina el lote encontrado', async () => {
      const plot = { farmPlotId: FARM_PLOT_ID, farm: { farmId: FARM_ID } };
      farmPlotsRepository.findOne.mockResolvedValue(plot);

      await service.remove(FARM_PLOT_ID);

      expect(farmPlotsRepository.remove).toHaveBeenCalledWith(plot);
    });
  });
});
