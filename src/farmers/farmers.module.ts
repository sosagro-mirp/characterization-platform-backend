import { Module } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { FarmersController } from './farmers.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farmer } from './entities/farmer.entity';

@Module({
  controllers: [FarmersController],
  providers: [FarmersService],
  imports: [TypeOrmModule.forFeature([Farmer])],
})
export class FarmersModule {}
