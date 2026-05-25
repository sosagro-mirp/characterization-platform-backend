import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @Public()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns the health status of the application and database. Used by orchestrators (Railway, uptime monitors, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Application and database are healthy',
    schema: {
      example: {
        status: 'ok',
        info: {
          database: {
            status: 'up',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Application or database is unhealthy',
    schema: {
      example: {
        status: 'error',
        error: {
          database: {
            status: 'down',
            message: 'Connection refused',
          },
        },
      },
    },
  })
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
