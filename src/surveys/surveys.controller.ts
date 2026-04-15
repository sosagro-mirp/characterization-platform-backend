import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SurveyFilters, SurveysService } from './surveys.service';

@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Post()
  create(@Body() createSurveyDto: CreateSurveyDto) {
    return this.surveysService.create(createSurveyDto);
  }

  @Get()
  findAll(
    @Query('actorTypeId') actorTypeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('townId') townId?: string,
    @Query('vereda') vereda?: string,
    @Query('cropId') cropId?: string,
    @Query('instrumentId') instrumentId?: string,
  ) {
    const filters: SurveyFilters = {
      actorTypeId,
      departmentId,
      townId,
      vereda,
      cropId,
      instrumentId,
    };
    return this.surveysService.findAll(filters);
  }

  @Patch(':id/sync')
  markAsSynchronized(@Param('id', ParseUUIDPipe) id: string) {
    return this.surveysService.markAsSynchronized(id);
  }
}
