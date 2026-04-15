import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createProxyMiddleware } from 'http-proxy-middleware';

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
    const chatUrl = this.configService.get<string>('services.chat');
    const routesUrl = this.configService.get<string>('services.routes');

    // Proxy hacia chat-service (HTTP + WebSocket)
    consumer
      .apply(
        createProxyMiddleware({
          target: chatUrl,
          changeOrigin: true,
          pathRewrite: { '^/api/chat': '' },
          ws: true,
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
