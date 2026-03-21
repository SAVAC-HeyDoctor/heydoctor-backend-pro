import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { Consultation } from './consultation.entity';

/** Predicted condition from AI analysis. */
export interface PredictedCondition {
  condition: string;
  code?: string;
  probability?: number;
  confidence?: number;
  timeframe?: string;
}

/** Risk score for a condition. */
export interface RiskScore {
  condition: string;
  score: number;
  level: 'low' | 'medium' | 'high';
  factors?: string[];
}

/** Clinical pattern detected by AI. */
export interface ClinicalPattern {
  pattern: string;
  description?: string;
  relevance?: string;
  evidence?: string[];
}

/** Recommended clinical action. */
export interface RecommendedAction {
  action: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  rationale?: string;
}

@Entity('ai_insights')
export class AiInsight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  patientId: string;

  @Column('uuid', { nullable: true })
  consultationId: string | null;

  @Column('uuid', { nullable: true })
  clinicId: string | null;

  @Column({ name: 'predicted_conditions', type: 'jsonb', nullable: true })
  predicted_conditions: PredictedCondition[] | null;

  @Column({ name: 'risk_scores', type: 'jsonb', nullable: true })
  risk_scores: RiskScore[] | null;

  @Column({ name: 'clinical_patterns', type: 'jsonb', nullable: true })
  clinical_patterns: ClinicalPattern[] | null;

  @Column({ name: 'recommended_actions', type: 'jsonb', nullable: true })
  recommended_actions: RecommendedAction[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Patient, (p) => p.ai_insights, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => Consultation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'consultationId' })
  consultation: Consultation | null;
}
