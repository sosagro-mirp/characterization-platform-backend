import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TownsService } from './towns.service';
import { CreateTownDto } from './dto/create-town.dto';
import { UpdateTownDto } from './dto/update-town.dto';

@Controller('towns')
export class TownsController {
  constructor(private readonly townsService: TownsService) {}

  @Post()
  create(@Body() createTownDto: CreateTownDto) {
    return this.townsService.create(createTownDto);
  }

  @Get()
  findAll() {
    return this.townsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.townsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTownDto: UpdateTownDto) {
    return this.townsService.update(+id, updateTownDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.townsService.remove(+id);
  }
}
