import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmerConnection } from './entities/farmer-connection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FarmerConnection])],
})
export class FarmersConnectionsModule {}
