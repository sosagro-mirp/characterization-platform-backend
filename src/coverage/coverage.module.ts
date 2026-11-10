import { Module } from '@nestjs/common';
import { ConsentsModule } from '../consents/consents.module';
import { CoverageDataLoader } from './coverage-data.loader';
import { FarmerCoverageController } from './farmer-coverage.controller';
import { FarmerCoverageService } from './farmer-coverage.service';

@Module({
  imports: [ConsentsModule],
  controllers: [FarmerCoverageController],
  providers: [CoverageDataLoader, FarmerCoverageService],
  exports: [CoverageDataLoader, FarmerCoverageService],
})
export class CoverageModule {}
