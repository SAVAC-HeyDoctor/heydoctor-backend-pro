import { Injectable } from '@nestjs/common';

export interface ClinicalApp {
  id: string;
  name: string;
  description: string;
  icon?: string;
  url?: string;
  category?: string;
}

@Injectable()
export class ClinicalAppsService {
  private readonly apps: ClinicalApp[] = [
    {
      id: '1',
      name: 'Lab Orders',
      description: 'Ordenar exámenes de laboratorio',
      icon: 'lab',
      category: 'orders',
    },
    {
      id: '2',
      name: 'Prescriptions',
      description: 'Crear y gestionar recetas médicas',
      icon: 'prescription',
      category: 'orders',
    },
    {
      id: '3',
      name: 'Clinical Notes',
      description: 'Notas clínicas y registros',
      icon: 'notes',
      category: 'records',
    },
    {
      id: '4',
      name: 'CDSS',
      description: 'Sistema de soporte de decisiones clínicas',
      icon: 'cdss',
      category: 'ai',
    },
    {
      id: '5',
      name: 'Predictive Medicine',
      description: 'Evaluación de riesgos predictivos',
      icon: 'predictive',
      category: 'ai',
    },
    {
      id: '6',
      name: 'Templates',
      description: 'Plantillas de documentos clínicos',
      icon: 'template',
      category: 'tools',
    },
  ];

  async getApps(): Promise<{ data: ClinicalApp[] }> {
    return { data: this.apps };
  }
}
