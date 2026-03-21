import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { ClinicResolverInterceptor } from './common/interceptors/clinic-resolver.interceptor';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { ClinicModule } from './modules/clinic/clinic.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { CdssModule } from './modules/cdss/cdss.module';
import { PredictiveMedicineModule } from './modules/predictive-medicine/predictive-medicine.module';
import { ClinicalIntelligenceModule } from './modules/clinical-intelligence/clinical-intelligence.module';
import { SearchModule } from './modules/search/search.module';
import { LabOrdersModule } from './modules/lab-orders/lab-orders.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { ClinicalInsightModule } from './modules/clinical-insight/clinical-insight.module';
import { ClinicalAppsModule } from './modules/clinical-apps/clinical-apps.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { FavoriteOrdersModule } from './modules/favorite-orders/favorite-orders.module';
import { PatientRemindersModule } from './modules/patient-reminders/patient-reminders.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRoot(typeOrmConfig),
    CommonModule,
    AuthModule,
    ClinicModule,
    PatientsModule,
    ConsultationsModule,
    CopilotModule,
    CdssModule,
    PredictiveMedicineModule,
    ClinicalIntelligenceModule,
    SearchModule,
    LabOrdersModule,
    PrescriptionsModule,
    ClinicalInsightModule,
    ClinicalAppsModule,
    TemplatesModule,
    FavoriteOrdersModule,
    PatientRemindersModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClinicResolverInterceptor,
    },
  ],
})
export class AppModule {}
