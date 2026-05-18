import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard, Trash2 } from 'lucide-react';
import * as api from '../../api';
import type { PaymentSchedule, PaymentScheduleData } from '../../types';
import Button from '../ui/Button';

interface Props {
  schedules: PaymentSchedule[];
  onAddSchedule: (data: PaymentScheduleData) => Promise<void>;
  onPaySchedule: (schedule: PaymentSchedule) => void;
  onDeleteSchedule: (scheduleId: string) => void;
}

export default function PaymentSchedulesPanel({
  schedules,
  onAddSchedule,
  onPaySchedule,
  onDeleteSchedule,
}: Props) {
  const { t } = useTranslation();
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedule, setNewSchedule] = useState<PaymentScheduleData>({ due_date: '', amount: 0, note: '' });

  const handleAdd = async () => {
    if (!newSchedule.due_date || newSchedule.amount <= 0) return;
    await onAddSchedule(newSchedule);
    setNewSchedule({ due_date: '', amount: 0, note: '' });
    setShowAddSchedule(false);
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-ink-main">{t('purchases.scheduleTitle')}</h3>
        <button
          onClick={() => setShowAddSchedule(s => !s)}
          className="flex items-center gap-1 rounded-xl border border-ivory-border px-3 py-1.5 text-sm text-ink-muted hover:text-primary-600 hover:bg-ivory-muted"
        >
          <Plus size={14} />{t('purchases.addSchedule')}
        </button>
      </div>

      {showAddSchedule && (
        <div className="mb-3 flex flex-wrap gap-2 p-3 bg-ivory-muted rounded-sm border border-ivory-border">
          <input
            type="date"
            value={newSchedule.due_date}
            onChange={e => setNewSchedule(s => ({ ...s, due_date: e.target.value }))}
            className="app-input px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder={t('purchases.scheduleAmount')}
            value={newSchedule.amount > 0 ? newSchedule.amount / 100 : ''}
            onChange={e => setNewSchedule(s => ({ ...s, amount: Math.round(parseFloat(e.target.value || '0') * 100) }))}
            min={0}
            step={0.01}
            className="app-input px-3 py-2 text-sm w-32"
          />
          <input
            type="text"
            placeholder={t('purchases.scheduleNote')}
            value={newSchedule.note ?? ''}
            onChange={e => setNewSchedule(s => ({ ...s, note: e.target.value }))}
            className="app-input px-3 py-2 text-sm flex-1 min-w-[120px]"
          />
          <Button onClick={handleAdd}>{t('common.save')}</Button>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="py-6 text-center text-sm text-ink-muted border border-dashed border-ivory-border rounded-sm">
          {t('purchases.scheduleEmpty')}
        </div>
      ) : (
        <div className="overflow-x-auto border border-ivory-border rounded-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ivory-muted border-b border-ivory-border">
                <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleDueDate')}</th>
                <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleAmount')}</th>
                <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleNote')}</th>
                <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleStatus')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => {
                const today = new Date().toISOString().slice(0, 10);
                const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                const isOverdue = !s.is_paid && s.due_date < today;
                const isDueSoon = !s.is_paid && !isOverdue && s.due_date <= tomorrow;
                return (
                  <tr key={s.id} className="border-b border-ivory-border bg-ivory-surface last:border-0">
                    <td className={`px-4 py-2 tabular-nums ${
                      isOverdue ? 'text-status-danger font-medium'
                      : isDueSoon ? 'text-amber-600 font-medium'
                      : 'text-ink-main'
                    }`}>
                      {s.due_date}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-ink-main">{api.formatMoney(s.amount)}</td>
                    <td className="px-4 py-2 text-ink-muted">{s.note}</td>
                    <td className="px-4 py-2">
                      {s.is_paid
                        ? <span className="text-status-success text-xs font-medium">{t('purchases.schedulePaid')}</span>
                        : isOverdue
                          ? <span className="text-status-danger text-xs font-medium">{t('purchases.scheduleOverdue')}</span>
                          : isDueSoon
                            ? <span className="text-amber-600 text-xs font-medium">{t('purchases.scheduleDueSoon')}</span>
                            : <span className="text-ink-muted text-xs">{t('purchases.schedulePending')}</span>
                      }
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-end">
                        {!s.is_paid && (
                          <button
                            onClick={() => onPaySchedule(s)}
                            className="flex items-center gap-1 rounded-lg border border-ivory-border px-2 py-1 text-xs text-ink-muted hover:text-primary-600 hover:border-primary-600"
                            title={t('purchases.markPaid')}
                          >
                            <CreditCard size={13} />{t('purchases.payNow')}
                          </button>
                        )}
                        {!s.is_paid && (
                          <button
                            onClick={() => onDeleteSchedule(s.id)}
                            className="p-1.5 rounded-lg text-ink-muted hover:text-status-danger hover:bg-red-50"
                            title={t('common.delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
