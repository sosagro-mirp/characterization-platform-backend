import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { Farm } from './entities/farm.entity';
import { FarmCrop } from './entities/farm-crop.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';

/**
 * Spec 94 — los cultivos de la finca ya no se reemplazan: `PATCH /farms/:id`
 * archiva y reactiva, y `POST /farms/:id/crops` es idempotente. La persistencia
 * real la cubre `e2e-094` (C5); aquí, que el servicio nunca borre.
 */

const FARM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CAFE = '11111111-1111-4111-8111-111111111111';
const CACAO = '22222222-2222-4222-8222-222222222222';

describe('FarmsService — cultivos de finca aditivos (spec 94)', () => {
  let service: FarmsService;
  let sqls: string[];
  let updateBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };
  let manager: {
    save: jest.Mock;
    findBy: jest.Mock;
    query: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let farmsRepository: {
    findOne: jest.Mock;
    manager: { transaction: jest.Mock; query: jest.Mock };
  };
  let cropsRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    sqls = [];
    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    manager = {
      save: jest.fn((_e: unknown, farm: unknown) => Promise.resolve(farm)),
      findBy: jest
        .fn()
        .mockResolvedValue([{ cropId: CAFE }, { cropId: CACAO }]),
      query: jest.fn((sql: string) => {
        sqls.push(sql.replace(/\s+/g, ' ').trim());
        return Promise.resolve([{ farm_crop_id: 'fc-1', crop_id: CAFE }]);
      }),
      createQueryBuilder: jest.fn(() => updateBuilder),
    };
    farmsRepository = {
      findOne: jest.fn().mockResolvedValue({ farmId: FARM_ID, name: 'Finca' }),
      manager: {
        transaction: jest.fn((cb: (m: typeof manager) => unknown) =>
          Promise.resolve(cb(manager)),
        ),
        query: manager.query,
      },
    };
    cropsRepository = {
      findOne: jest.fn().mockResolvedValue({ cropId: CAFE, name: 'Café' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmsService,
        { provide: getRepositoryToken(Farm), useValue: farmsRepository },
        { provide: getRepositoryToken(TypeOfCrop), useValue: cropsRepository },
      ],
    }).compile();
    service = module.get(FarmsService);
    // `update()` termina con `findOne` (relaciones cargadas); se simula.
    jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
  });

  it('PATCH con cropIds ARCHIVA los que se quitan (UPDATE archived_at) y suma/reactiva los pedidos; no borra', async () => {
    await service.update(FARM_ID, { cropIds: [CAFE] });

    expect(manager.createQueryBuilder).toHaveBeenCalled();
    expect(updateBuilder.update).toHaveBeenCalledWith(FarmCrop);
    const [[set]] = updateBuilder.set.mock.calls as [
      [{ archivedAt: () => string }],
    ];
    expect(set.archivedAt()).toBe('CURRENT_TIMESTAMP');
    expect(
      sqls.some((q) =>
        q.includes(
          'ON CONFLICT (farm_id, crop_id) DO UPDATE SET archived_at = NULL',
        ),
      ),
    ).toBe(true);
    expect(sqls.some((q) => /DELETE/i.test(q))).toBe(false);
  });

  it('PATCH sin cropIds no toca los cultivos', async () => {
    await service.update(FARM_ID, { name: 'Nuevo nombre' });
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    expect(sqls).toEqual([]);
  });

  it('PATCH con cropIds vacío archiva todos y no inserta nada', async () => {
    await service.update(FARM_ID, { cropIds: [] });
    expect(manager.createQueryBuilder).toHaveBeenCalled();
    expect(sqls).toEqual([]);
  });

  it('POST /farms/:id/crops es idempotente: devuelve el cultivo de finca existente o reactivado', async () => {
    const result = await service.addCrop(FARM_ID, { cropId: CAFE });
    expect(result).toEqual({ farmCropId: 'fc-1', cropId: CAFE, name: 'Café' });
    expect(sqls[0]).toContain(
      'ON CONFLICT (farm_id, crop_id) DO UPDATE SET archived_at = NULL',
    );
  });

  it('POST /farms/:id/crops responde 404 si la finca o el cultivo no existen', async () => {
    farmsRepository.findOne.mockResolvedValue(null);
    await expect(
      service.addCrop(FARM_ID, { cropId: CAFE }),
    ).rejects.toBeInstanceOf(NotFoundException);

    farmsRepository.findOne.mockResolvedValue({ farmId: FARM_ID });
    cropsRepository.findOne.mockResolvedValue(null);
    await expect(
      service.addCrop(FARM_ID, { cropId: CAFE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
