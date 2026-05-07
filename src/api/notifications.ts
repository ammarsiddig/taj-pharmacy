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
