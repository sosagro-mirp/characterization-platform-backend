import { Injectable } from '@nestjs/common';
import { CreateCooperativeDto } from './dto/create-cooperative.dto';
import { UpdateCooperativeDto } from './dto/update-cooperative.dto';

@Injectable()
export class CooperativesService {
  create(createCooperativeDto: CreateCooperativeDto) {
    return 'This action adds a new cooperative';
  }

  findAll() {
    return `This action returns all cooperatives`;
  }

  findOne(id: number) {
    return `This action returns a #${id} cooperative`;
  }

  update(id: number, updateCooperativeDto: UpdateCooperativeDto) {
    return `This action updates a #${id} cooperative`;
  }

  remove(id: number) {
    return `This action removes a #${id} cooperative`;
  }
}
