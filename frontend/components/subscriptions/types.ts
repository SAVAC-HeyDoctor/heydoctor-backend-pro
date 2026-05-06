export type SubscriptionEventRow = {
  id: string;
  userId: string;
  clinicId: string;
  eventType: string;
  previousPlan: string | null;
  newPlan: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type SubscriptionsSummaryResponse = {
  totalUsers: number;
  proUsers: number;
  inactivePro: number;
  activeSubscriptions: number;
};

export type SubscriptionsMetricsResponse = {
  monthlyRevenue: number;
  churnRate: number;
  newSubscriptions: number;
  paymentSuccessCount: number;
};
