import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ConsentRecordsService } from './consent-records.service';
import { CreateConsentRecordDto } from './dto/create-consent-record.dto';
import { RevokeConsentRecordDto } from './dto/revoke-consent-record.dto';

@ApiTags('Consent Records')
@ApiBearerAuth()
@Controller('consents')
export class ConsentRecordsController {
  constructor(private readonly consentRecordsService: ConsentRecordsService) {}

  @Post()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Registrar la aceptación del consentimiento informado',
    description:
      'Idempotente por (sessionId, consentDocumentId): un reintento devuelve el registro ya ' +
      'existente en vez de duplicarlo (200 en vez de 201 en ese caso). Rechaza con 422 si ' +
      'acceptedDataProcessing no es true.',
  })
  @ApiResponse({ status: 201, description: 'Constancia registrada.' })
  @ApiResponse({
    status: 422,
    description: 'Falta la autorización obligatoria de tratamiento de datos.',
  })
  async create(
    @Body() dto: CreateConsentRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { record } = await this.consentRecordsService.create(
      dto,
      user.userId,
    );
    return record;
  }

  @Get()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Listar constancias de consentimiento' })
  @ApiQuery({ name: 'farmerId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'sessionId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'consentDocumentId', required: false, format: 'uuid' })
  findAll(
    @Query('farmerId') farmerId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('consentDocumentId') consentDocumentId?: string,
  ) {
    return this.consentRecordsService.findAll({
      farmerId,
      sessionId,
      consentDocumentId,
    });
  }

  @Post(':id/revoke')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Revocar una constancia de consentimiento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Constancia revocada.' })
  @ApiResponse({ status: 422, description: 'Falta el motivo de revocación.' })
  async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevokeConsentRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.consentRecordsService.revoke(id, dto.reason, user.userId);
    return { revoked: true };
  }
}
