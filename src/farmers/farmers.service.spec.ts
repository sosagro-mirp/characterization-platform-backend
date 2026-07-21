import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FarmersService } from './farmers.service';
import { Farmer } from './entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';

describe('FarmersService', () => {
  let service: FarmersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmersService,
        { provide: getRepositoryToken(Farmer), useValue: {} },
        { provide: getRepositoryToken(Farm), useValue: {} },
        { provide: getRepositoryToken(Town), useValue: {} },
      ],
    }).compile();

    service = module.get<FarmersService>(FarmersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
