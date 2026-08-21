import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FarmsService } from './farms.service';
import { Farm } from './entities/farm.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';

describe('FarmsService', () => {
  let service: FarmsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmsService,
        { provide: getRepositoryToken(Farm), useValue: {} },
        { provide: getRepositoryToken(TypeOfCrop), useValue: {} },
      ],
    }).compile();

    service = module.get<FarmsService>(FarmsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
