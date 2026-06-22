import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeRequest } from './entities/change-request.entity';
import { User } from 'src/users/entities/user.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestsController } from './change-requests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChangeRequest, User, Farmer])],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
