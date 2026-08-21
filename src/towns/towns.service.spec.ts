import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TownsService } from './towns.service';
import { Town } from './entities/town.entity';
import { Department } from 'src/departments/entities/department.entity';

describe('TownsService', () => {
  let service: TownsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TownsService,
        { provide: getRepositoryToken(Town), useValue: {} },
        { provide: getRepositoryToken(Department), useValue: {} },
      ],
    }).compile();

    service = module.get<TownsService>(TownsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
