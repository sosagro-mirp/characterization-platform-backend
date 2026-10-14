import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { Farmer } from './entities/farmer.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { ConsentRecordsService } from '../consents/consent-records.service';

/**
 * Spec 94 — `POST/PATCH /farmers/:id/farms` (vínculo N:M con rol). Cubre las
 * reglas del servicio con un `EntityManager` simulado; la persistencia real
 * (índice único parcial, espejo) la cubre `e2e-094` (C6, C9, C11).
 */

const FARMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FARM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

interface LinkRow {
  farmer_id: string;
  farm_id: string;
  role: string;
  is_primary: boolean;
  source: string;
}

describe('FarmersService — vínculo productor–finca (spec 94)', () => {
  let service: FarmersService;
  let farmersRepository: {
    findOne: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let farmsRepository: { findOne: jest.Mock };
  let queries: string[];
  /** Vínculos simulados: lo que `farmer_farms` tendría. */
  let links: LinkRow[];

  const manager = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      queries.push(text);
      if (text.startsWith('SELECT farmer_id, farm_id, role, is_primary')) {
        return Promise.resolve(
          links.filter(
            (l) => l.farmer_id === params[0] && l.farm_id === params[1],
          ),
        );
      }
      if (text.startsWith('SELECT is_primary FROM farmer_farms')) {
        return Promise.resolve(
          links
            .filter((l) => l.farmer_id === params[0] && l.farm_id === params[1])
            .map((l) => ({ is_primary: l.is_primary })),
        );
      }
      if (text.startsWith('SELECT farm_id FROM farmer_farms')) {
        return Promise.resolve(
          links.filter((l) => l.farmer_id === params[0] && l.is_primary),
        );
      }
      if (text.startsWith('INSERT INTO farmer_farms')) {
        links.push({
          farmer_id: params[0] as string,
          farm_id: params[1] as string,
          role: params[2] as string,
          is_primary: params[3] as boolean,
          source: params[4] as string,
        });
      }
      return Promise.resolve([]);
    }),
  };

  beforeEach(async () => {
    queries = [];
    links = [];
    manager.query.mockClear();
    farmersRepository = {
      findOne: jest.fn().mockResolvedValue({ id: FARMER_ID }),
      manager: {
        transaction: jest.fn((cb: (m: typeof manager) => unknown) =>
          Promise.resolve(cb(manager)),
        ),
      },
    };
    farmsRepository = {
      findOne: jest.fn().mockResolvedValue({ farmId: FARM_ID }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmersService,
        { provide: getRepositoryToken(Farmer), useValue: farmersRepository },
        { provide: getRepositoryToken(Farm), useValue: farmsRepository },
        { provide: getRepositoryToken(Town), useValue: {} },
        { provide: getRepositoryToken(CampaignSession), useValue: {} },
        { provide: getRepositoryToken(Survey), useValue: {} },
        { provide: getRepositoryToken(FarmerDocumentCollision), useValue: {} },
        { provide: ConsentRecordsService, useValue: {} },
      ],
    }).compile();
    service = module.get(FarmersService);
  });

  describe('linkFarm', () => {
    it('crea el vínculo con rol por defecto producer y, al ser el primero, queda principal', async () => {
      const link = await service.linkFarm(FARMER_ID, { farmId: FARM_ID });
      expect(link).toEqual({
        farmerId: FARMER_ID,
        farmId: FARM_ID,
        role: 'producer',
        isPrimary: true,
        source: 'admin',
      });
      expect(queries).toContain(
        'UPDATE farmers SET farm_id = $2 WHERE id = $1',
      );
    });

    it('respeta el rol indicado', async () => {
      links.push({
        farmer_id: FARMER_ID,
        farm_id: 'otra-finca',
        role: 'producer',
        is_primary: true,
        source: 'backfill',
      });
      const link = await service.linkFarm(FARMER_ID, {
        farmId: FARM_ID,
        role: 'worker',
      });
      expect(link).toMatchObject({ role: 'worker', isPrimary: false });
    });

    it('responde 409 si el vínculo ya existe', async () => {
      links.push({
        farmer_id: FARMER_ID,
        farm_id: FARM_ID,
        role: 'worker',
        is_primary: false,
        source: 'admin',
      });
      await expect(
        service.linkFarm(FARMER_ID, { farmId: FARM_ID, role: 'worker' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 404 si el productor o la finca no existen', async () => {
      farmersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.linkFarm(FARMER_ID, { farmId: FARM_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);

      farmersRepository.findOne.mockResolvedValue({ id: FARMER_ID });
      farmsRepository.findOne.mockResolvedValue(null);
      await expect(
        service.linkFarm(FARMER_ID, { farmId: FARM_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateFarmLink', () => {
    beforeEach(() => {
      links.push(
        {
          farmer_id: FARMER_ID,
          farm_id: 'finca-principal',
          role: 'producer',
          is_primary: true,
          source: 'backfill',
        },
        {
          farmer_id: FARMER_ID,
          farm_id: FARM_ID,
          role: 'worker',
          is_primary: false,
          source: 'admin',
        },
      );
    });

    it('isPrimary:true libera la principal anterior y actualiza el espejo', async () => {
      await service.updateFarmLink(FARMER_ID, FARM_ID, { isPrimary: true });
      const displace = queries.findIndex((q) =>
        q.includes('SET is_primary = false'),
      );
      const promote = queries.findIndex((q) =>
        q.includes('SET is_primary = true'),
      );
      expect(displace).toBeGreaterThanOrEqual(0);
      expect(displace).toBeLessThan(promote);
      expect(queries).toContain(
        'UPDATE farmers SET farm_id = $2 WHERE id = $1',
      );
    });

    it('cambia solo el rol sin tocar la principal', async () => {
      await service.updateFarmLink(FARMER_ID, FARM_ID, { role: 'owner' });
      expect(
        queries.some((q) => q.startsWith('UPDATE farmer_farms SET role')),
      ).toBe(true);
      expect(queries.some((q) => q.includes('SET is_primary'))).toBe(false);
      expect(queries.some((q) => q.startsWith('UPDATE farmers'))).toBe(false);
    });

    it('rechaza (400) quitar la principal sin designar otra', async () => {
      await expect(
        service.updateFarmLink(FARMER_ID, 'finca-principal', {
          isPrimary: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('responde 404 si el vínculo no existe', async () => {
      await expect(
        service.updateFarmLink(FARMER_ID, 'no-vinculada', { role: 'owner' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
