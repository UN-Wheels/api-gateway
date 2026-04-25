import { Controller, All, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';

@Controller('api/notifications')
export class NotificationsGatewayController {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  @All()
  async proxyBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res);
  }

  @All('*')
  async proxyWildcard(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res);
  }

  private async proxyRequest(req: Request, res: Response) {
    const notificationsUrl = this.configService.get<string>('services.notifications');
    const cookieName = this.configService.get<string>('cookie.name');

    if (!notificationsUrl) {
      return res
        .status(503)
        .json({ message: 'Notifications service not available yet', available: false });
    }

    const token =
      req.cookies?.[cookieName] ||
      req.headers?.authorization?.replace(/^Bearer\s+/i, '');

    const userId =
      (req as any).user?.user_id ||
      (typeof req.headers?.['x-user-id'] === 'string' ? req.headers['x-user-id'] : undefined);

    const userRole =
      (req as any).user?.role ||
      (typeof req.headers?.['x-user-role'] === 'string' ? req.headers['x-user-role'] : '');

    const path =
      req.path === '/' || req.path === ''
        ? '/notifications'
        : req.path.replace(/^\/api\/notifications/, '/notifications');

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: req.method as any,
          url: `${notificationsUrl}${path}`,
          data:
            req.body && Object.keys(req.body).length > 0
              ? req.body
              : undefined,
          params: req.query,
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
            ...(userId && { 'x-user-id': userId }),
            ...(userRole && { 'x-user-role': userRole }),
          },
        }),
      );

      if (response.status === 204) {
        return res.status(204).send();
      }
      return res.status(response.status).json(response.data);
    } catch (error) {
      const status = error.response?.status ?? 500;
      const body = error.response?.data ?? {
        error: 'Error en el servicio de notificaciones',
      };
      return res.status(status).json(body);
    }
  }
}
