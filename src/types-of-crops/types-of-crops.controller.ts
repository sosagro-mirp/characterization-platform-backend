import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TypesOfCropsService } from './types-of-crops.service';

@ApiTags('Types of Crops')
@Controller('types-of-crops')
export class TypesOfCropsController {
  constructor(private readonly typesOfCropsService: TypesOfCropsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List all crop types' })
  @ApiResponse({ status: 200, description: 'List of crop types.' })
  findAll() {
    return this.typesOfCropsService.findAll();
  }
}
