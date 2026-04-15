import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActorTypesController } from './actor-types.controller';
import { ActorTypesService } from './actor-types.service';
import { ActorType } from './entities/actor-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ActorType])],
  controllers: [ActorTypesController],
  providers: [ActorTypesService],
  exports: [ActorTypesService],
})
export class ActorTypesModule {}
