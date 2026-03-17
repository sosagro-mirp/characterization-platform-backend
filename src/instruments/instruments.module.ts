import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from './entities/instrument.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument])],
})
export class InstrumentsModule {}
