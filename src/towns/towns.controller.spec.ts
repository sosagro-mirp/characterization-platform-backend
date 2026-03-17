import { Test, TestingModule } from '@nestjs/testing';
import { TownsController } from './towns.controller';
import { TownsService } from './towns.service';

describe('TownsController', () => {
  let controller: TownsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TownsController],
      providers: [TownsService],
    }).compile();

    controller = module.get<TownsController>(TownsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
