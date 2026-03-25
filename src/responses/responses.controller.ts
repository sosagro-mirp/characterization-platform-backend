import { Body, Controller, ParseArrayPipe, Post } from '@nestjs/common';
import { CreateResponseDto } from './dto/create-response.dto';
import { ResponsesService } from './responses.service';

@Controller('responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  create(@Body() createResponseDto: CreateResponseDto) {
    return this.responsesService.create(createResponseDto);
  }

  @Post('batch')
  createMany(
    @Body(new ParseArrayPipe({ items: CreateResponseDto }))
    createResponseDtos: CreateResponseDto[],
  ) {
    return this.responsesService.createMany(createResponseDtos);
  }
}
