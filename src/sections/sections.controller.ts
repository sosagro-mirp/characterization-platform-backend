import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateSectionDto } from './dto/create-section.dto';
import { SectionsService } from './sections.service';

@Controller('instruments/:instrumentId/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Post()
  create(
    @Param('instrumentId', new ParseUUIDPipe()) instrumentId: string,
    @Body() createSectionDto: CreateSectionDto,
  ) {
    return this.sectionsService.create(instrumentId, createSectionDto);
  }

  @Get()
  findAll(@Param('instrumentId', new ParseUUIDPipe()) instrumentId: string) {
    return this.sectionsService.findAll(instrumentId);
  }

  @Get(':sectionId')
  findOne(
    @Param('instrumentId', new ParseUUIDPipe()) instrumentId: string,
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
  ) {
    return this.sectionsService.findOne(instrumentId, sectionId);
  }
}
