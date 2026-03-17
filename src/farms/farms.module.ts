import { Module } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farm } from './entities/farm.entity';

@Module({
  controllers: [FarmsController],
  providers: [FarmsService],
  imports: [TypeOrmModule.forFeature([Farm])],
})
export class FarmsModule {}
