import { Test, TestingModule } from '@nestjs/testing';
import { CooperativesService } from './cooperatives.service';

describe('CooperativesService', () => {
  let service: CooperativesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CooperativesService],
    }).compile();

    service = module.get<CooperativesService>(CooperativesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
