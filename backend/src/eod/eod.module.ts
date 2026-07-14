import { Module } from '@nestjs/common';
import { EodController } from './eod.controller';
import { EodService } from './eod.service';
import { EodAutoCloseService } from './eod-auto-close.service';

@Module({
  controllers: [EodController],
  providers: [EodService, EodAutoCloseService],
})
export class EodModule {}
