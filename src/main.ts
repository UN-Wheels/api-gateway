import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port        = configService.get<number>('port');
  const frontendUrl = configService.get<string>('frontend.url');
  const chatUrl     = configService.get<string>('services.chat');
  const notifUrl    = configService.get<string>('services.notifications');

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

  // ── Socket.IO proxies ──────────────────────────────────────────────────────
  // En HPM v2, pasar el path como PRIMER argumento de createProxyMiddleware
  // hace que la libreria filtre internamente tanto en HTTP como en el evento
  // 'upgrade' que ella misma auto-registra al primer request. Por eso aqui
  // NO hay que registrar manualmente app.getHttpServer().on('upgrade') —
  // hacerlo causaba que el upgrade se procesara 2 veces y rompia el socket
  // con ERR_STREAM_WRITE_AFTER_END.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onProxyError = (err: any, req: any, res: any) => {
    const code = err?.code ?? '';
    // Estos codigos son ruido benigno post-disconnect, no necesitan log.
    const benign = code === 'ECONNRESET' || code === 'ERR_STREAM_WRITE_AFTER_END';

    if (!benign) {
      console.error(`[WS Proxy] ${code || err?.message || 'error'}`);
    }

    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      try {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad gateway' }));
      } catch { /* noop */ }
      return;
    }

    if (res && typeof res.destroy === 'function') {
      try { res.destroy(); } catch { /* noop */ }
    }
  };

  const wsProxyBase = {
    changeOrigin: true,
    ws: true,
    timeout: 0,
    proxyTimeout: 0,
    logLevel: 'warn' as const,
    onError: onProxyError,
  };

  const chatWsProxy = createProxyMiddleware('/api/chat/socket.io', {
    target: chatUrl,
    pathRewrite: { '^/api/chat': '' },
    ...wsProxyBase,
  });

  const notifWsProxy = createProxyMiddleware('/api/notifications/socket.io', {
    target: notifUrl,
    pathRewrite: { '^/api/notifications': '' },
    ...wsProxyBase,
  });

  // HPM v2 con path-filtering: solo procesa requests cuyo url empieza con
  // el path declarado. Tambien filtra los upgrades por path internamente.
  app.use(chatWsProxy as any);
  app.use(notifWsProxy as any);

  await app.listen(port);

  console.log(`API Gateway corriendo en http://localhost:${port}`);
}

bootstrap();
