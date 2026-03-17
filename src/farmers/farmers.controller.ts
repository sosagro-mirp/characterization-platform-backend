import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';

@Controller('farmers')
export class FarmersController {
  constructor(private readonly farmersService: FarmersService) {}

  @Post()
  create(@Body() createFarmerDto: CreateFarmerDto) {
    return this.farmersService.create(createFarmerDto);
  }

  @Get()
  findAll() {
    return this.farmersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.farmersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFarmerDto: UpdateFarmerDto) {
    return this.farmersService.update(+id, updateFarmerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.farmersService.remove(+id);
  }
}
