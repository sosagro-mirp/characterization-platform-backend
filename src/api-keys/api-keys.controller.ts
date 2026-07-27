import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtOnly } from '../auth/decorators/jwt-only.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import {
  ApiKeyCreatedResponseDto,
  ApiKeyResponseDto,
} from './dto/api-key-response.dto';
import { ApiKey } from './entities/api-key.entity';

function toResponseDto(apiKey: ApiKey): ApiKeyResponseDto {
  return {
    apiKeyId: apiKey.apiKeyId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    userId: apiKey.user?.userId,
    expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
    revokedAt: apiKey.revokedAt ? apiKey.revokedAt.toISOString() : null,
    lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
    createdAt: apiKey.createdAt.toISOString(),
  } as ApiKeyResponseDto;
}

@ApiTags('API Keys')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@JwtOnly()
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear API key',
    description:
      'El secreto completo se devuelve únicamente en esta respuesta. No hay forma de recuperarlo después.',
  })
  @ApiResponse({
    status: 201,
    description: 'API key creada.',
    type: ApiKeyCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'El usuario indicado no existe.' })
  async create(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiKeyCreatedResponseDto> {
    const { entity, rawKey } = await this.apiKeysService.create(
      dto,
      user?.userId,
    );
    return { ...toResponseDto(entity), key: rawKey };
  }

  @Get()
  @ApiOperation({ summary: 'Listar API keys (sin secreto)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de API keys.',
    type: [ApiKeyResponseDto],
  })
  async findAll(): Promise<ApiKeyResponseDto[]> {
    const apiKeys = await this.apiKeysService.findAll();
    return apiKeys.map(toResponseDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener API key por ID (sin secreto)' })
  @ApiParam({ name: 'id', description: 'UUID de la API key', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'API key encontrada.',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key no encontrada.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiKeyResponseDto> {
    const apiKey = await this.apiKeysService.findOne(id);
    return toResponseDto(apiKey);
  }

  @Patch(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar API key' })
  @ApiParam({ name: 'id', description: 'UUID de la API key', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'API key revocada.',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key no encontrada.' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiKeyResponseDto> {
    const apiKey = await this.apiKeysService.revoke(id);
    return toResponseDto(apiKey);
  }
}
