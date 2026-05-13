import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS configuration from CORS_ORIGINS env var (comma-separated list)
  const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SOSAgro Characterization Platform API')
    .setDescription(
      'API REST para la plataforma de caracterización agrícola. ' +
        'Permite diseñar instrumentos de encuesta y aplicarlos a agricultores.',
    )
    .setVersion('1.0')
    .addServer('http://localhost:3000', 'Desarrollo local')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Pega aquí el accessToken devuelto por POST /api/auth/login',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  document.tags = [
    { name: 'Departments' },
    { name: 'Towns' },
    { name: 'Cooperatives' },
    { name: 'Farmers' },
    { name: 'Farms' },
    { name: 'Actor Types' },
    { name: 'Instruments' },
    { name: 'Sections' },
    { name: 'Questions' },
    { name: 'Question Types' },
    { name: 'Options' },
    { name: 'Surveys' },
    { name: 'Responses' },
    { name: 'Users' },
    { name: 'Auth' },
    { name: 'Health' },
  ];

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
