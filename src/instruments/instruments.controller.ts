import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { InstrumentsService } from './instruments.service';

class FindAllInstrumentsQuery {
  @IsOptional()
  @IsUUID()
  actorTypeId?: string;
}

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Post()
  create(@Body() createInstrumentDto: CreateInstrumentDto) {
    return this.instrumentsService.create(createInstrumentDto);
  }

  @Get()
  findAll(@Query() query: FindAllInstrumentsQuery) {
    if (query.actorTypeId) {
      return this.instrumentsService.findByActorType(query.actorTypeId);
    }
    return this.instrumentsService.findAll();
  }

  @Get(':id/render')
  findOneForRender(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.instrumentsService.findOneForRender(id);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.instrumentsService.findOne(id);
  }
}
