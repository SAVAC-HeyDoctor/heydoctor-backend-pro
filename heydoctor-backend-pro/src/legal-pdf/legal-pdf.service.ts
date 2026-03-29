import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';

type FullConsultationPdf = {
  id: string;
  status: string;
  reason: string;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  createdAt: Date;
  signedAt: Date | null;
  doctorSignature: string | null;
  doctorId: string;
  patientId: string;
  consentVersion: string | null;
  consentGivenAt: Date | null;
  consentIp: string | null;
  consentUserAgent: string | null;
};

function val(value: string | Date | null | undefined): string {
  if (value == null) return 'N/A';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const v = String(value).trim();
  return v.length > 0 ? v : 'N/A';
}

const LEGAL_ENTITY = {
  name: 'SAVAC LTDA',
  rut: '76.373.761-6',
  brand: 'SAVAC Bienestar y Salud (INAPI N° 1435386)',
  product: 'HeyDoctor',
};

@Injectable()
export class LegalPdfService {
  constructor(
    @InjectRepository(Consultation)
    private readonly consultationsRepo: Repository<Consultation>,
    @InjectRepository(Patient)
    private readonly patientsRepo: Repository<Patient>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async loadData(
    consultationId: string,
    authUser: AuthenticatedUser,
  ): Promise<{
    consultation: FullConsultationPdf;
    patient: { name: string; email: string };
    doctor: { email: string };
  }> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);

    const row = await this.consultationsRepo.findOne({
      where: { id: consultationId, clinicId },
    });
    if (!row) throw new NotFoundException('Consultation not found');

    const patient = await this.patientsRepo.findOne({
      where: { id: row.patientId },
    });
    const doctor = await this.usersRepo.findOne({
      where: { id: row.doctorId },
    });

    return {
      consultation: {
        id: row.id,
        status: row.status,
        reason: row.reason,
        diagnosis: row.diagnosis,
        treatment: row.treatment,
        notes: row.notes,
        createdAt: row.createdAt,
        signedAt: row.signedAt,
        doctorSignature: row.doctorSignature,
        doctorId: row.doctorId,
        patientId: row.patientId,
        consentVersion: row.consentVersion,
        consentGivenAt: row.consentGivenAt,
        consentIp: row.consentIp,
        consentUserAgent: row.consentUserAgent,
      },
      patient: {
        name: patient?.name ?? 'N/A',
        email: patient?.email ?? 'N/A',
      },
      doctor: {
        email: doctor?.email ?? 'N/A',
      },
    };
  }

  private buildPdf(data: {
    consultation: FullConsultationPdf;
    patient: { name: string; email: string };
    doctor: { email: string };
  }): Promise<Buffer> {
    const { consultation: c, patient, doctor } = data;
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `${LEGAL_ENTITY.product} — Consulta ${c.id}`,
          Author: LEGAL_ENTITY.name,
          Subject: 'Documento legal de consulta médica',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      doc.font('Helvetica-Bold').fontSize(22).fillColor('#078a92').text(LEGAL_ENTITY.product);
      doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      doc.text(`${LEGAL_ENTITY.name} · RUT ${LEGAL_ENTITY.rut}`);
      doc.text(LEGAL_ENTITY.brand);
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.8);

      this.pdfSection(doc, 'DATOS DE LA CONSULTA');
      this.pdfRow(doc, 'ID Consulta', c.id);
      this.pdfRow(doc, 'Estado', c.status.toUpperCase());
      this.pdfRow(doc, 'Fecha de creación', val(c.createdAt));
      this.pdfRow(doc, 'Motivo', c.reason);
      doc.moveDown(0.6);

      this.pdfSection(doc, 'PACIENTE');
      this.pdfRow(doc, 'Nombre', patient.name);
      this.pdfRow(doc, 'Email', patient.email);
      this.pdfRow(doc, 'ID Paciente', c.patientId);
      doc.moveDown(0.6);

      this.pdfSection(doc, 'PROFESIONAL DE SALUD');
      this.pdfRow(doc, 'Email', doctor.email);
      this.pdfRow(doc, 'ID Doctor', c.doctorId);
      doc.moveDown(0.6);

      this.pdfSection(doc, 'DATOS CLÍNICOS');
      this.pdfRow(doc, 'Diagnóstico', val(c.diagnosis));
      this.pdfRow(doc, 'Tratamiento', val(c.treatment));
      if (c.notes) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155').text('Notas:');
        doc.font('Helvetica').fontSize(10).fillColor('#475569').text(c.notes, { indent: 10 });
      }
      doc.moveDown(0.6);

      this.pdfSection(doc, 'CONSENTIMIENTO INFORMADO');
      this.pdfRow(doc, 'Versión', val(c.consentVersion));
      this.pdfRow(doc, 'Fecha de aceptación', val(c.consentGivenAt));
      this.pdfRow(doc, 'Dirección IP', val(c.consentIp));
      this.pdfRow(doc, 'User-Agent', val(c.consentUserAgent));
      doc.moveDown(0.6);

      this.pdfSection(doc, 'FIRMA DIGITAL');
      this.pdfRow(doc, 'Fecha de firma', val(c.signedAt));
      if (c.doctorSignature) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Firma del profesional (base64 almacenada):');
        doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(
          c.doctorSignature.slice(0, 80) + '...',
          { indent: 10 },
        );
      } else {
        this.pdfRow(doc, 'Firma', 'No firmada');
      }

      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8');
      doc.text(
        `Documento generado automáticamente por ${LEGAL_ENTITY.product} el ${new Date().toISOString()}. ` +
          `Este documento es confidencial y contiene información de salud protegida. ` +
          `Operado por ${LEGAL_ENTITY.name} (RUT ${LEGAL_ENTITY.rut}). ` +
          `${LEGAL_ENTITY.product} actúa como intermediario tecnológico; el profesional es responsable del acto clínico.`,
        { align: 'center' },
      );

      doc.end();
    });
  }

  private pdfSection(doc: PDFKit.PDFDocument, title: string): void {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(title);
    doc.moveDown(0.3);
  }

  private pdfRow(doc: PDFKit.PDFDocument, label: string, value: string): void {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#475569').text(value);
  }

  async generateConsultationPdf(
    consultationId: string,
    authUser: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const data = await this.loadData(consultationId, authUser);
    const buffer = await this.buildPdf(data);
    return {
      buffer,
      fileName: `heydoctor-legal-${data.consultation.id}.pdf`,
    };
  }
}
