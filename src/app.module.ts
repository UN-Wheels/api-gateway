import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createProxyMiddleware } from 'http-proxy-middleware';
import * as jwt from 'jsonwebtoken';

import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { JwtAuthGuard } from './auth/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    AuthModule,
    GatewayModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly configService: ConfigService) {}

  configure(consumer: MiddlewareConsumer) {
    const authUrl = this.configService.get<string>('services.auth');
    const chatUrl = this.configService.get<string>('services.chat');
    const routesUrl = this.configService.get<string>('services.routes');
    const jwtSecret = this.configService.get<string>('jwt.secret');
    const cookieName = this.configService.get<string>('cookie.name');

    // Proxy hacia loggueo_service para endpoints de vehículos.
    // El JwtAuthGuard global no alcanza estas rutas (proxy middleware las intercepta
    // primero), por lo que el JWT se extrae manualmente y se reenvía como Bearer.
    consumer
      .apply(
        createProxyMiddleware({
          target: authUrl,
          changeOrigin: true,
          pathRewrite: { '^/api/vehicles': '/api/v1/vehicles' },
          onProxyReq: (proxyReq, req: any) => {
            const token =
              req.cookies?.[cookieName] ||
              req.headers?.authorization?.replace(/^Bearer\s+/i, '');

            if (token) {
              proxyReq.setHeader('Authorization', `Bearer ${token}`);
            }

            proxyReq.removeHeader('cookie');

            if (req.body && Object.keys(req.body).length > 0) {
              const bodyData = JSON.stringify(req.body);
              proxyReq.setHeader('Content-Type', 'application/json');
              proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
              proxyReq.write(bodyData);
            }
          },
        }),
      )
      .forRoutes({ path: 'api/vehicles/*', method: RequestMethod.ALL });

    // Proxy hacia chat-service (HTTP + WebSocket).
    // onProxyReq valida el JWT aquí porque el proxy middleware corre ANTES que
    // los guards de NestJS — el JwtAuthGuard global nunca alcanza estas rutas.
    // Se inyectan X-User-Id / X-User-Role para que el chat-service confíe en ellos
    // sin re-validar el JWT.
    consumer
      .apply(
        createProxyMiddleware({
          target: chatUrl,
          changeOrigin: true,
          pathRewrite: { '^/api/chat': '' },
          onProxyReq: (proxyReq, req: any) => {
            // onProxyReq se dispara también en upgrades WebSocket — ignorar,
            // ya que en ese contexto los headers no se pueden modificar.
            if (req.headers?.upgrade === 'websocket') return;

            // ── 1. Modificar headers ANTES de write() ──────────────────────
            // Validar JWT e inyectar X-User-Id.
            // El guard global de NestJS nunca alcanza estas rutas porque el
            // proxy middleware las intercepta primero.
            const token =
              req.cookies?.[cookieName] ||
              req.headers?.authorization?.replace(/^Bearer\s+/i, '');

            if (token) {
              try {
                const decoded = jwt.verify(token, jwtSecret!) as any;
                const userId = decoded.user_id ?? decoded.sub;
                if (userId) {
                  proxyReq.setHeader('x-user-id', userId);
                  proxyReq.setHeader('x-user-role', decoded.role ?? '');
                }
              } catch {
                // Token inválido — el chat-service devolverá 401
              }
            }

            proxyReq.removeHeader('authorization');

            // ── 2. Re-stream del body DESPUÉS de todos los setHeader/removeHeader ──
            // El body-parser global de NestJS consume el stream del request antes
            // de que el proxy lo pueda pipear. write() compromete los headers,
            // por eso debe ir al final.
            if (req.body && Object.keys(req.body).length > 0) {
              const bodyData = JSON.stringify(req.body);
              proxyReq.setHeader('Content-Type', 'application/json');
              proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
              proxyReq.write(bodyData);
            }
          },
        }),
      )
      .forRoutes({ path: 'api/chat/*', method: RequestMethod.ALL });

    // Proxy hacia routes-reservations-service
    // Si ROUTES_SERVICE_URL no está configurado, el stub devuelve 503
    if (routesUrl) {
      consumer
        .apply(
          createProxyMiddleware({
            target: routesUrl,
            changeOrigin: true,
            pathRewrite: { '^/api/routes': '' },
            onProxyReq: (proxyReq, req: any) => {
              const token =
                req.cookies?.[cookieName] ||
                req.headers?.authorization?.replace(/^Bearer\s+/i, '');

              if (token) {
                proxyReq.setHeader('Authorization', `Bearer ${token}`);
              }

              proxyReq.removeHeader('cookie');

              if (req.body && Object.keys(req.body).length > 0) {
                const bodyData = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
              }
            },
          }),
        )
        .forRoutes({ path: 'api/routes/*', method: RequestMethod.ALL });
    } else {
      consumer
        .apply((_req, res, _next) => {
          res.status(503).json({
            message: 'Routes service not available yet',
            available: false,
          });
        })
        .forRoutes({ path: 'api/routes/*', method: RequestMethod.ALL });
    }
  }
}
