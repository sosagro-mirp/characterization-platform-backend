import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Verifica que el servidor esté en línea.' })
  @ApiResponse({ status: 200, description: 'Servidor en línea.' })
  getHello(): string {
    return this.appService.getHello();
  }
}
