import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { User } from 'src/users/entities/user.entity';
import { Town } from 'src/towns/entities/town.entity';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsService } from './instruments.service';
import { Instrument } from './entities/instrument.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument, ActorType, User, Town])],
  controllers: [InstrumentsController],
  providers: [InstrumentsService],
})
export class InstrumentsModule {}
