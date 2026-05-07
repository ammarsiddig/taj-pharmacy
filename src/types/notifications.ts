export interface NotificationRow {
  id: string;
  notification_type: string;
  title: string;
  title_ar?: string;
  message: string;
  message_ar?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  reference_type?: string;
  reference_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationSummary {
  unread_count: number;
  notifications: NotificationRow[];
}
