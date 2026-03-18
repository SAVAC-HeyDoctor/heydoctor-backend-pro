import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicUser } from '../entities';
import { OpenAIService } from './services/openai.service';
import { ClinicResolverInterceptor } from './interceptors/clinic-resolver.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ClinicUser])],
  providers: [OpenAIService, ClinicResolverInterceptor],
  exports: [OpenAIService, ClinicResolverInterceptor, TypeOrmModule],
})
export class CommonModule {}
