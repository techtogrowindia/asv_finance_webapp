import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CentersModule } from './centers/centers.module';
import { ClientsModule } from './clients/clients.module';
import { MastersModule } from './masters/masters.module';
import { LoansModule } from './loans/loans.module';
import { DocumentsModule } from './documents/documents.module';
import { EmployeesModule } from './employees/employees.module';
import { CollectionsModule } from './collections/collections.module';
import { SettingsModule } from './settings/settings.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DashboardModule,
    CentersModule,
    ClientsModule,
    MastersModule,
    LoansModule,
    DocumentsModule,
    EmployeesModule,
    CollectionsModule,
    SettingsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global auth: every route requires a valid JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Then role checks for routes that declare @Roles(...).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
