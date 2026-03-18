import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabOrder, Patient, Medication, Doctor } from '../../entities';
import { LabOrdersService } from './lab-orders.service';
import { LabOrdersController } from './lab-orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LabOrder, Patient, Medication, Doctor]),
  ],
  controllers: [LabOrdersController],
  providers: [LabOrdersService],
  exports: [LabOrdersService],
})
export class LabOrdersModule {}
