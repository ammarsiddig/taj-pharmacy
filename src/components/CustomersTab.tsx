import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as api from '../api';
import type { CustomerRow } from '../types';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Toast from './ui/Toast';
import { useLicense } from '../hooks/useLicense';

export default function CustomersTab() {
  const { t } = useTranslation();
  const { isBlocked } = useLicense();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [balanceFilter, setBalanceFilter] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const isActive = statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : null;
      const data = await api.getCustomers(
        search || undefined,
        isActive,
        balanceFilter || null,
      );
      setCustomers(data);
    } catch (err) {
      showToast('danger', String(err));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, balanceFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = () => { navigate('/customers/new'); };

  const handleToggleActive = async (c: CustomerRow) => {
    try {
      await api.toggleCustomerActive(c.id);
      loadData();
    } catch (err) {
      showToast('danger', String(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Filters */}
      <div className="sales-form-toolbar app-panel flex flex-wrap gap-3 p-4">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="app-input w-full px-3 py-2.5 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="app-input min-w-[180px] px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">{t('customers.allStatuses')}</option>
          <option value="active">{t('customers.active')}</option>
          <option value="inactive">{t('customers.inactive')}</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-main cursor-pointer">
          <input
            type="checkbox"
            checked={balanceFilter}
            onChange={(e) => setBalanceFilter(e.target.checked)}
            className="rounded-md border-ivory-border text-primary-600 focus:ring-primary-500"
          />
          {t('customers.hasBalance')}
        </label>
        <Button onClick={handleAdd} disabled={isBlocked} title={isBlocked ? t('license.licenseExpired') : undefined}>
          {t('customers.addCustomer')}
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="app-card py-12 text-center text-ink-muted">{t('common.loading')}</div>
      ) : customers.length === 0 ? (
        <div className="app-card py-20 text-center">
          <h3 className="text-lg font-bold text-ink-main mb-2">{t('common.noResults')}</h3>
        </div>
      ) : (
        <div className="sales-form-table-wrap app-card overflow-hidden">
          <table className="sales-form-table w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.name')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.phone')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.creditLimit')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.currentBalance')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.totalPurchases')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.lastPurchase')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.status')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="group cursor-pointer border-b border-ivory-border bg-white transition-colors hover:bg-primary-100/60"
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  <td className="px-4 py-2.5 font-medium text-ink-main">{c.name_ar || c.name}</td>
                  <td className="px-4 py-2.5 text-ink-muted tabular-nums">{c.phone || '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatCreditLimit(c.credit_limit, t('customers.creditUnlimited'))}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {c.current_balance > 0 ? (
                      <span className="text-status-danger font-medium">{api.formatMoney(c.current_balance)}</span>
                    ) : (
                      <span className="text-ink-muted">0.00</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(c.total_purchases)}</td>
                  <td className="px-4 py-2.5 text-ink-muted tabular-nums">{c.last_purchase_date?.slice(0, 10) || '—'}</td>
                  <td className="px-4 py-2.5">
                    {c.is_active ? (
                      <Badge variant="success">{t('customers.active')}</Badge>
                    ) : (
                      <Badge variant="neutral">{t('customers.inactive')}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.id}`); }}
                        className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-primary-600"
                        title={t('common.view')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleActive(c); }}
                        disabled={isBlocked}
                        className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-status-warning"
                        title={c.is_active ? t('customers.inactive') : t('customers.active')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {c.is_active ? (
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                          ) : (
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                          )}
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {customers.length > 0 && (
        <div className="text-xs text-ink-muted">
          {customers.length} {t('customers.title')}
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
