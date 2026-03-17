import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CooperativesService } from './cooperatives.service';
import { CreateCooperativeDto } from './dto/create-cooperative.dto';
import { UpdateCooperativeDto } from './dto/update-cooperative.dto';

@Controller('cooperatives')
export class CooperativesController {
  constructor(private readonly cooperativesService: CooperativesService) {}

  @Post()
  create(@Body() createCooperativeDto: CreateCooperativeDto) {
    return this.cooperativesService.create(createCooperativeDto);
  }

  @Get()
  findAll() {
    return this.cooperativesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cooperativesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCooperativeDto: UpdateCooperativeDto) {
    return this.cooperativesService.update(+id, updateCooperativeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cooperativesService.remove(+id);
  }
}
