import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port         = configService.get<number>('port');
  const frontendUrl  = configService.get<string>('frontend.url');
  const chatUrl      = configService.get<string>('services.chat');
  const notifUrl     = configService.get<string>('services.notifications');

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.getHttpAdapter().get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'api-gateway' });
  });

  // ── Socket.IO proxies ────────────────────────────────────────────────────────
  // Se crean ANTES de app.listen() para poder registrarlos como middleware
  // Express e interceptar el HTTP long-polling de Socket.IO antes de que
  // llegue al enrutador de NestJS.
  const chatWsProxy = createProxyMiddleware({
    target: chatUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/chat': '' },
    ws: true,
  });

  const notifWsProxy = createProxyMiddleware({
    target: notifUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/notifications': '' },
    ws: true,
  });

  // Interceptar polling HTTP de Socket.IO antes del router de NestJS.
  // Sin esto, las peticiones polling llegan al NotificationsGatewayController
  // que las reescribe con la ruta incorrecta.
  app.use((req, res, next) => {
    const url: string = req.url ?? '';
    if (url.startsWith('/api/chat/socket.io')) {
      return (chatWsProxy as any)(req, res, next);
    }
    if (url.startsWith('/api/notifications/socket.io')) {
      return (notifWsProxy as any)(req, res, next);
    }
    next();
  });

  await app.listen(port);

  // Upgrade HTTP→WS (debe registrarse después de listen para tener httpServer)
  app.getHttpServer().on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    if (url.startsWith('/api/chat/socket.io')) {
      return (chatWsProxy as any).upgrade(req, socket, head);
    }
    if (url.startsWith('/api/notifications/socket.io')) {
      return (notifWsProxy as any).upgrade(req, socket, head);
    }
    socket.destroy();
  });

  console.log(`API Gateway corriendo en http://localhost:${port}`);
}

bootstrap();
