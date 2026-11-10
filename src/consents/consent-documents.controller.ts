import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ConsentDocumentsService } from './consent-documents.service';
import { CreateConsentDocumentDto } from './dto/create-consent-document.dto';
import { UpdateConsentDocumentDto } from './dto/update-consent-document.dto';

@ApiTags('Consent Documents')
@ApiBearerAuth()
@Controller('consent-documents')
export class ConsentDocumentsController {
  constructor(
    private readonly consentDocumentsService: ConsentDocumentsService,
  ) {}

  @Post()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Crear una nueva versión del documento de consentimiento (draft)',
  })
  @ApiResponse({ status: 201, description: 'Documento creado en borrador.' })
  create(
    @Body() dto: CreateConsentDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consentDocumentsService.create(dto, user.userId);
  }

  @Get()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Listar todas las versiones del documento de consentimiento',
  })
  @ApiResponse({ status: 200, description: 'Lista de versiones.' })
  findAll() {
    return this.consentDocumentsService.findAll();
  }

  // Pública: la consumen la pantalla de consentimiento (web/móvil, ya
  // autenticadas por otra vía) y la página pública /privacidad de la landing.
  @Public()
  @Get('active')
  @ApiOperation({
    summary: 'Obtener la versión publicada actualmente',
    description:
      'Sin autenticación. Devuelve 404 si nunca se ha publicado ninguna versión.',
  })
  @ApiResponse({ status: 200, description: 'Documento publicado.' })
  @ApiResponse({
    status: 404,
    description: 'No hay ningún documento publicado.',
  })
  async findActive() {
    const document = await this.consentDocumentsService.findActive();
    if (!document) {
      throw new NotFoundException(
        'No hay ningún documento de consentimiento publicado',
      );
    }
    return document;
  }

  @Get(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Obtener una versión del documento de consentimiento por ID',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.consentDocumentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Editar una versión del documento de consentimiento',
    description:
      'Solo permitido mientras la versión está en borrador (409 en caso contrario).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Documento actualizado.' })
  @ApiResponse({
    status: 409,
    description: 'El documento ya no está en borrador.',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateConsentDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consentDocumentsService.update(id, dto, user.userId);
  }

  @Post(':id/publish')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Publicar una versión del documento de consentimiento',
    description:
      'Archiva la versión previamente publicada (si existe) en la misma transacción. ' +
      'A partir de este momento, todos los agricultores con consentimiento de una versión ' +
      'anterior dejan de estar vigentes.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Documento publicado.' })
  @ApiResponse({ status: 409, description: 'El documento ya está archivado.' })
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.consentDocumentsService.publish(id, user.userId);
  }
}
