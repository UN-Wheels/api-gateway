import { Controller, All, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';

@Controller('api/vehicles')
export class VehiclesGatewayController {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const authUrl = this.configService.get<string>('services.auth');
    const cookieName = this.configService.get<string>('cookie.name');

    const token =
      req.cookies?.[cookieName] ||
      req.headers?.authorization?.replace(/^Bearer\s+/i, '');

    const path = req.path.replace('/api/vehicles', '/api/v1/vehicles');

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: req.method as any,
          url: `${authUrl}${path}`,
          data:
            req.body && Object.keys(req.body).length > 0
              ? req.body
              : undefined,
          params: req.query,
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
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
        error: 'Error en el servicio de vehículos',
      };
      return res.status(status).json(body);
    }
  }
}
