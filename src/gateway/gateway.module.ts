import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthGatewayController } from './auth-gateway.controller';
import { RoutesGatewayController } from './routes-gateway.controller';
import { VehiclesGatewayController } from './vehicles-gateway.controller';

@Module({
  imports: [HttpModule],
  controllers: [AuthGatewayController, RoutesGatewayController, VehiclesGatewayController],
})
export class GatewayModule {}
