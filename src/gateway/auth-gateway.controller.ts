import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  All,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { Public } from '../common/decorators/public.decorator';

@Controller('api/auth')
export class AuthGatewayController {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Login: único endpoint que requiere transformación de respuesta.
   * Llama al loggueo_service, extrae el token JWT de la respuesta JSON,
   * lo convierte en una cookie HttpOnly y nunca lo expone al frontend.
   */
  @Public()
  @Post('login')
  async login(@Body() body: any, @Res() res: Response) {
    const authUrl = this.configService.get<string>('services.auth');
    const cookieName = this.configService.get<string>('cookie.name');
    const cookieMaxAge = this.configService.get<number>('cookie.maxAge');

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${authUrl}/api/v1/auth/login`, body),
      );

      const { access_token } = response.data;

      res.cookie(cookieName, access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: cookieMaxAge * 1000,
      });

      return res.json({ message: 'Login exitoso' });
    } catch (error) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message = error.response?.data?.detail || 'Error al autenticar';
      throw new HttpException(message, status);
    }
  }

  /**
   * Register: proxy directo hacia loggueo_service, no requiere token.
   */
  @Public()
  @Post('register')
  async register(@Body() body: any, @Res() res: Response) {
    const authUrl = this.configService.get<string>('services.auth');

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${authUrl}/api/v1/auth/register`, body),
      );
      return res.status(201).json(response.data);
    } catch (error) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message = error.response?.data?.detail || 'Error al registrar usuario';
      throw new HttpException(message, status);
    }
  }

  /**
   * Logout: limpia la cookie del cliente.
   * No necesita llamar al loggueo_service porque los JWT son stateless.
   */
  @Post('logout')
  logout(@Res() res: Response) {
    const cookieName = this.configService.get<string>('cookie.name');
    res.clearCookie(cookieName);
    return res.json({ message: 'Sesión cerrada' });
  }

  /**
   * Resto de endpoints de auth (ej. GET /me, PUT /me).
   * Proxy directo con el token inyectado por el guard como Bearer.
   */
  @All('*')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    const authUrl = this.configService.get<string>('services.auth');

    const path = req.path.replace('/api/auth', '/api/v1/auth');

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: req.method as any,
          url: `${authUrl}${path}`,
          data: req.body,
          headers: {
            'Content-Type': 'application/json',
            ...(req.cookies?.access_token && {
              Authorization: `Bearer ${req.cookies.access_token}`,
            }),
          },
        }),
      );
      return res.status(response.status).json(response.data);
    } catch (error) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message = error.response?.data?.detail || 'Error en el servicio de autenticación';
      throw new HttpException(message, status);
    }
  }
}
