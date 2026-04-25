import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('port');
  const frontendUrl = configService.get<string>('frontend.url');

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

  await app.listen(port);

  // WebSocket proxy: conectar el evento 'upgrade' del servidor HTTP al proxy
  // del chat-service. Esto es necesario porque NestJS no expone el evento
  // 'upgrade' a través del MiddlewareConsumer — hay que hacerlo sobre el
  // servidor HTTP nativo después de que app.listen() haya sido llamado.
  const chatUrl = configService.get<string>('services.chat');
  const notificationsUrl = configService.get<string>('services.notifications');

  const chatWsProxy = createProxyMiddleware({
    target: chatUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/chat': '' },
    ws: true,
  });

  const notificationsWsProxy = createProxyMiddleware({
    target: notificationsUrl,
    changeOrigin: true,
    pathRewrite: { '^/api/notifications': '' },
    ws: true,
  });

  app.getHttpServer().on('upgrade', (req, socket, head) => {
    const requestUrl = req.url || '';

    if (requestUrl.startsWith('/api/chat/socket.io')) {
      return chatWsProxy.upgrade(req, socket, head);
    }

    if (requestUrl.startsWith('/api/notifications/socket.io')) {
      return notificationsWsProxy.upgrade(req, socket, head);
    }

    socket.destroy();
  });

  console.log(`API Gateway corriendo en http://localhost:${port}`);
}

bootstrap();
