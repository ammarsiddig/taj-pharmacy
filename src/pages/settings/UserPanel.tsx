import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { User, UserFormData, Role, Branch } from '../../types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';

interface UserPanelProps {
  user: User | null;
  roles: Role[];
  branches: Branch[];
  onSave: (data: UserFormData) => Promise<void>;
  onClose: () => void;
}

export default function UserPanel({ user, roles, branches, onSave, onClose }: UserPanelProps) {
  const { t } = useTranslation();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<UserFormData>({
    full_name: user?.full_name ?? '',
    full_name_ar: user?.full_name_ar ?? '',
    username: user?.username ?? '',
    password: '',
    role_id: user?.role_id ?? roles[0]?.id ?? '',
    branch_id: user?.branch_id ?? branches[0]?.id ?? '',
    is_active: user?.is_active ?? true,
  });

  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  const updateField = (key: keyof UserFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.full_name.trim()) errs.full_name = t('common.required');
    if (!form.username.trim()) errs.username = t('common.required');
    if (!user && !form.password) errs.password = t('common.required');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name_ar || r.name }));
  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name_ar || b.name }));

  return (
    <div className="sales-form-modal-overlay" onClick={onClose}>
      <div className="sales-form-modal" onClick={(event) => event.stopPropagation()}>
      <div className="sales-form-panel-header">
        <h3 className="text-base font-bold text-ink-main">
          {user ? t('settings.editUser') : t('settings.addNewUser')}
        </h3>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-main p-1">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="sales-form-panel-body">
        <Input
          ref={firstFieldRef}
          label={t('settings.fullName') + '*'}
          value={form.full_name}
          onChange={(e) => updateField('full_name', e.target.value)}
          error={errors.full_name}
        />
        <Input
          label={t('settings.username') + '*'}
          value={form.username}
          onChange={(e) => updateField('username', e.target.value)}
          error={errors.username}
          autoComplete="off"
        />
        <Input
          label={t('settings.password') + (user ? '' : '*')}
          type="password"
          value={form.password || ''}
          onChange={(e) => updateField('password', e.target.value)}
          error={errors.password}
          placeholder={user ? t('common.noChange') : ''}
          autoComplete="new-password"
        />
        <Select
          label={t('settings.role') + '*'}
          value={form.role_id}
          onChange={(e) => updateField('role_id', e.target.value)}
          options={roleOptions}
        />
        <Select
          label={t('settings.branch') + '*'}
          value={form.branch_id}
          onChange={(e) => updateField('branch_id', e.target.value)}
          options={branchOptions}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => updateField('is_active', e.target.checked)}
            className="w-4 h-4 accent-primary-600"
          />
          <span className="text-sm text-ink-main">{t('settings.active')}</span>
        </label>

        <div className="app-panel p-4 bg-primary-50/40 border border-primary-100">
          <p className="text-xs text-ink-muted leading-relaxed">
            تُدار الصلاحيات الآن من تبويب <span className="font-bold text-primary-700">«الصلاحيات»</span>:
            عيّن للمستخدم دوراً ثم خصّص أي صلاحية على حدة من شاشة الصلاحيات.
          </p>
        </div>

        <div className="flex gap-3 mt-auto pt-4 border-t border-ivory-border">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? t('common.loading') : t('settings.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('settings.cancel')}
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}
