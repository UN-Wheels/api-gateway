import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthGatewayController } from './auth-gateway.controller';

@Module({
  imports: [HttpModule],
  controllers: [AuthGatewayController],
})
export class GatewayModule {}
