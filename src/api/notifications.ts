import { invoke } from '../lib/tauri';
import type { NotificationRow, NotificationSummary } from '../types';
import { getTenantId } from './core';

export async function getNotifications(userId: string, unreadOnly = false, limit = 50): Promise<NotificationSummary> {
  return invoke('get_notifications', { tenantId: getTenantId(), userId, unreadOnly, limit });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  return invoke('mark_notification_read', { tenantId: getTenantId(), notificationId });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  return invoke('mark_all_notifications_read', { tenantId: getTenantId(), userId });
}

export async function getSystemAlerts(branchId: string): Promise<NotificationRow[]> {
  return invoke('get_system_alerts', { tenantId: getTenantId(), branchId });
}

export interface PendingUpdateResult {
  available: boolean;
  version: string;
  current_version: string;
  notes: string | null;
  pub_date: string | null;
}

export async function checkPendingUpdate(): Promise<PendingUpdateResult> {
  return invoke('check_pending_update', { tenantId: getTenantId() });
}

export async function dismissSystemAlert(alertType: string): Promise<void> {
  return invoke('dismiss_system_alert', { tenantId: getTenantId(), alertType });
}

export async function undismissAllSystemAlerts(): Promise<void> {
  return invoke('undismiss_all_system_alerts', { tenantId: getTenantId() });
}
