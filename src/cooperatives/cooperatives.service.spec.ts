import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CooperativesService } from './cooperatives.service';
import { Cooperative } from './entities/cooperative.entity';
import { Department } from 'src/departments/entities/department.entity';

describe('CooperativesService', () => {
  let service: CooperativesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CooperativesService,
        { provide: getRepositoryToken(Cooperative), useValue: {} },
        { provide: getRepositoryToken(Department), useValue: {} },
      ],
    }).compile();

    service = module.get<CooperativesService>(CooperativesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
