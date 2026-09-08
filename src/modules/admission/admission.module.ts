import { Module } from '@nestjs/common';
import { AdmissionService } from './admission.service';
import { AdmissionController } from './admission.controller';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [StudentsModule],
  controllers: [AdmissionController],
  providers: [AdmissionService],
  exports: [AdmissionService],
})
export class AdmissionModule {}
