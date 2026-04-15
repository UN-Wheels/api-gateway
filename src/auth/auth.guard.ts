import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    try {
      const secret = this.configService.get<string>('jwt.secret');
      const decoded = jwt.verify(token, secret) as any;

      // Normalización del payload: loggueo_service usa "sub" (email),
      // chat-service espera "user_id". El gateway unifica esto aquí
      // para que ningún microservicio downstream tenga que manejar ambos formatos.
      const userId = decoded.user_id ?? decoded.sub;

      if (!userId) {
        throw new UnauthorizedException('Token sin identificador de usuario');
      }

      request.user = {
        user_id: userId,
        role: decoded.role,
      };

      // Inyectar headers internos para los microservicios downstream.
      // Los servicios leen X-User-Id en lugar de decodificar el JWT ellos mismos.
      request.headers['x-user-id'] = userId;
      request.headers['x-user-role'] = decoded.role ?? '';

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  private extractToken(request: any): string | undefined {
    // 1. Cookie HttpOnly (flujo web principal)
    const cookieToken = request.cookies?.[
      this.configService.get<string>('cookie.name')
    ];
    if (cookieToken) return cookieToken;

    // 2. Header Authorization: Bearer (clientes móviles o herramientas como Postman)
    const authHeader = request.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return undefined;
  }
}
