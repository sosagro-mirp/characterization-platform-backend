import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfConnection } from './entities/type-of-connection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TypeOfConnection])],
})
export class TypesOfConnectionsModule {}
