import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthGatewayController } from './auth-gateway.controller';
import { RoutesGatewayController } from './routes-gateway.controller';

@Module({
  imports: [HttpModule],
  controllers: [AuthGatewayController, RoutesGatewayController],
})
export class GatewayModule {}
