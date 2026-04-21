import { Controller, All, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('api/routes')
export class RoutesGatewayController {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  private async fetchUser(
    email: string,
    authUrl: string,
    token: string,
    cache: Map<string, any>,
  ): Promise<any> {
    if (cache.has(email)) return cache.get(email);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(
          `${authUrl}/api/v1/auth/users/${encodeURIComponent(email)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      cache.set(email, data);
      return data;
    } catch {
      cache.set(email, null);
      return null;
    }
  }

  private async fetchVehicle(
    vehicleId: string,
    authUrl: string,
    token: string,
    cache: Map<string, any>,
  ): Promise<any> {
    const cacheKey = `vehicle:${vehicleId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(
          `${authUrl}/api/v1/vehicles/public/${vehicleId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      cache.set(cacheKey, data);
      return data;
    } catch {
      cache.set(cacheKey, null);
      return null;
    }
  }

  // Recorre el JSON y reemplaza driverId → driver, passengerId → passenger, vehicleId → vehicle
  private async enrich(
    node: any,
    authUrl: string,
    token: string,
    cache: Map<string, any>,
  ): Promise<any> {
    if (!node || typeof node !== 'object') return node;

    if (Array.isArray(node)) {
      return Promise.all(node.map((item) => this.enrich(item, authUrl, token, cache)));
    }

    const out: any = {};

    for (const [key, value] of Object.entries(node)) {
      if (key === 'driverId' && typeof value === 'string') {
        const user = await this.fetchUser(value, authUrl, token, cache);
        out['driver'] = user ?? { email: value };
      } else if (key === 'passengerId' && typeof value === 'string') {
        const user = await this.fetchUser(value, authUrl, token, cache);
        out['passenger'] = user ?? { email: value };
      } else if (key === 'vehicleId' && typeof value === 'string') {
        const vehicle = await this.fetchVehicle(value, authUrl, token, cache);
        out['vehicle'] = vehicle ?? { id: value };
      } else if (value && typeof value === 'object') {
        out[key] = await this.enrich(value, authUrl, token, cache);
      } else {
        out[key] = value;
      }
    }

    return out;
  }

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const routesUrl = this.configService.get<string>('services.routes');
    const authUrl = this.configService.get<string>('services.auth');
    const cookieName = this.configService.get<string>('cookie.name');

    if (!routesUrl) {
      return res
        .status(503)
        .json({ message: 'Routes service not available yet', available: false });
    }

    const token: string | undefined =
      req.cookies?.[cookieName] ||
      req.headers?.authorization?.replace(/^Bearer\s+/i, '');

    const path = req.path.replace(/^\/api\/routes/, '');

    try {
      const upstream = await firstValueFrom(
        this.httpService.request({
          method: req.method as any,
          url: `${routesUrl}${path}`,
          data: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
          params: req.query,
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }),
      );

      let data = upstream.data;

      if (req.method === 'GET' && token) {
        data = await this.enrich(data, authUrl!, token, new Map());
      }

      return res.status(upstream.status).json(data);
    } catch (error) {
      const status = error.response?.status ?? 500;
      const body = error.response?.data ?? { error: 'Error en el servicio de rutas' };
      return res.status(status).json(body);
    }
  }
}
