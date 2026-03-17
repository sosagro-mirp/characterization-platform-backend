import { Injectable } from '@nestjs/common';
import { CreateTownDto } from './dto/create-town.dto';
import { UpdateTownDto } from './dto/update-town.dto';

@Injectable()
export class TownsService {
  create(createTownDto: CreateTownDto) {
    return 'This action adds a new town';
  }

  findAll() {
    return `This action returns all towns`;
  }

  findOne(id: number) {
    return `This action returns a #${id} town`;
  }

  update(id: number, updateTownDto: UpdateTownDto) {
    return `This action updates a #${id} town`;
  }

  remove(id: number) {
    return `This action removes a #${id} town`;
  }
}
