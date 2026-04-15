import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Verifica que el servidor esté en línea.' })
  @ApiResponse({ status: 200, description: 'Servidor en línea.' })
  getHello(): string {
    return this.appService.getHello();
  }
}
