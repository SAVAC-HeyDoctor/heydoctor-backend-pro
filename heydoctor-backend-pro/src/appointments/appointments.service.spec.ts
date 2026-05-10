import { ConflictException, type LoggerService } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { UsersService } from '../users/users.service';
import { Appointment } from './appointment.entity';
import { AppointmentStatus } from './appointment-status.enum';
import { AppointmentsService } from './appointments.service';

function createService(result: Array<{ id: string; clinic_id: string }>) {
  const repo = {
    query: jest.fn().mockResolvedValue(result),
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const logger: Partial<LoggerService> = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const service = new AppointmentsService(
    repo as unknown as Repository<Appointment>,
    {} as AuthorizationService,
    {} as UsersService,
    logger as LoggerService,
  );

  return { service, repo };
}

describe('AppointmentsService token actions', () => {
  const token = '00000000-0000-4000-8000-000000000000';

  it('confirms an appointment with a single atomic update', async () => {
    const { service, repo } = createService([
      { id: 'appointment-1', clinic_id: 'clinic-1' },
    ]);

    await expect(service.confirmByToken(token)).resolves.toEqual({
      success: true,
      status: 'confirmed',
      message: 'Su cita ha sido confirmada',
    });

    expect(repo.findOne).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE appointments'),
      [token, AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
    );
  });

  it('throws ConflictException when cancel finds no pending row', async () => {
    const { service, repo } = createService([]);

    await expect(service.cancelByToken(token)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.findOne).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE appointments'),
      [token, AppointmentStatus.CANCELLED, AppointmentStatus.PENDING],
    );
  });
});
