import { Controller, All, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('api/notifications')
export class NotificationsGatewayController {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const notificationsUrl = this.configService.get<string>('services.notifications');
    const cookieName = this.configService.get<string>('cookie.name');

    if (!notificationsUrl) {
      return res.status(503).json({ message: 'Notifications service not available', available: false });
    }

    const token: string | undefined =
      req.cookies?.[cookieName] ||
      req.headers?.authorization?.replace(/^Bearer\s+/i, '');

    const path = req.path.replace(/^\/api\/notifications/, '/notifications');

    try {
      const upstream = await firstValueFrom(
        this.httpService.request({
          method: req.method as any,
          url: `${notificationsUrl}${path}`,
          data: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
          params: req.query,
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}`, Cookie: `${cookieName}=${token}` }),
          },
          validateStatus: () => true,
        }),
      );

      if (upstream.status === 204 || upstream.data === undefined || upstream.data === null) {
        return res.status(upstream.status).end();
      }
      return res.status(upstream.status).json(upstream.data);
    } catch (error) {
      const status = error.response?.status ?? 500;
      const body = error.response?.data ?? { error: 'Error en el servicio de notificaciones' };
      return res.status(status).json(body);
    }
  }
}
