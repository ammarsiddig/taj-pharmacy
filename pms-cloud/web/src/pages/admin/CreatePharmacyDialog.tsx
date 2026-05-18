import { useState } from 'react';
import { useCreateLicense, useCreateOwner } from '../../hooks/admin';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DURATIONS = [
  { days: 30, label: 'شهر', key: '1mo' },
  { days: 90, label: '3 أشهر', key: '3mo' },
  { days: 180, label: '6 أشهر', key: '6mo' },
  { days: 365, label: 'سنة', key: '1yr' },
];

export default function CreatePharmacyDialog({ open, onClose }: Props) {
  const [step, setStep] = useState<'form' | 'result' | 'owner'>('form');
  const [name, setName] = useState('');
  const [durationKey, setDurationKey] = useState('1yr');
  const [plan, setPlan] = useState('basic');
  const [createOwnerToo, setCreateOwnerToo] = useState(true);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [result, setResult] = useState<{ key: string; tenant_id: string; expires_at: string } | null>(null);
  const [ownerError, setOwnerError] = useState('');
  const [ownerCreated, setOwnerCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  const createLicense = useCreateLicense();
  const createOwner = useCreateOwner();

  function reset() {
    setName('');
    setDurationKey('1yr');
    setPlan('basic');
    setCreateOwnerToo(true);
    setOwnerEmail('');
    setOwnerPassword('');
    setResult(null);
    setOwnerError('');
    setOwnerCreated(false);
    setStep('form');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const duration = DURATIONS.find(d => d.key === durationKey) || DURATIONS[3];
    try {
      const res = await createLicense.mutateAsync({
        pharmacy_name: name.trim(),
        days: duration.days,
        plan,
        create_new_tenant: true,
      });
      setResult(res);
      setStep('result');

      if (createOwnerToo && ownerEmail.trim() && ownerPassword.length >= 6) {
        setStep('owner');
        try {
          await createOwner.mutateAsync({
            tenantId: res.tenant_id,
            email: ownerEmail.trim(),
            password: ownerPassword,
          });
          setOwnerCreated(true);
        } catch (err: any) {
          setOwnerError(err.message || 'فشل إنشاء حساب المالك');
        }
      }
    } catch {
      // handled by mutation error state
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getCredentialMessage(): string {
    if (!result || !ownerEmail) return '';
    return `مرحباً، تم إنشاء حسابك في TAJ Pharmacy.

مفتاح الترخيص: ${result.key}
البريد الإلكتروني: ${ownerEmail}
كلمة المرور: ${ownerPassword}

لتحميل البرنامج: ${window.location.origin}/download/TAJ-Pharmacy-Setup.exe

للدعم الفني: تواصل معنا عبر الواتساب`;
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={step === 'form' ? 'إنشاء صيدلية جديدة' : step === 'result' ? 'تم الإنشاء' : 'إنشاء حساب المالك'} size="md">
      {step === 'form' && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>اسم الصيدلية</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="صيدلية..." required
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>مدة الاشتراك</label>
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map(d => (
                <button key={d.key} type="button" onClick={() => setDurationKey(d.key)}
                  className="rounded-xl py-2 text-sm font-bold"
                  style={{ background: durationKey === d.key ? 'var(--color-primary-600)' : 'var(--color-surface-secondary)', color: durationKey === d.key ? 'white' : 'var(--color-ink-muted)' }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t pt-4" style={{ borderColor: 'var(--color-ivory-border)' }}>
            <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={createOwnerToo} onChange={e => setCreateOwnerToo(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>إنشاء حساب المالك مباشرة</span>
            </label>
            {createOwnerToo && (
              <div className="flex flex-col gap-3">
                <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
                  placeholder="البريد الإلكتروني للمالك" className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }} />
                <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)}
                  placeholder="كلمة المرور (6 أحرف على الأقل)" className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }} />
              </div>
            )}
          </div>
          <Button type="submit" loading={createLicense.isPending} disabled={!name.trim()} fullWidth>
            إنشاء الصيدلية والمفتاح
          </Button>
        </form>
      )}

      {step === 'result' && result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--color-status-success-bg)' }}>
            <p className="font-bold mb-2" style={{ color: 'var(--color-status-success)' }}>✅ تم إنشاء الصيدلية بنجاح</p>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-ink-muted)' }}>مفتاح الترخيص</span>
                <button onClick={() => copy(result.key)} className="font-mono font-bold" style={{ color: 'var(--color-ink-main)' }}>{result.key} {copied ? '✓' : '📋'}</button>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-ink-muted)' }}>معرف الصيدلية</span>
                <span className="font-mono text-xs" style={{ color: 'var(--color-ink-main)' }}>{result.tenant_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-ink-muted)' }}>تاريخ الانتهاء</span>
                <span style={{ color: 'var(--color-ink-main)' }}>{new Date(result.expires_at).toLocaleDateString('ar')}</span>
              </div>
            </div>
          </div>

          {createOwnerToo && ownerEmail && (
            <div className="rounded-xl p-4" style={{ background: ownerCreated ? 'var(--color-status-success-bg)' : ownerError ? 'var(--color-status-danger-bg)' : 'var(--color-ivory-muted)' }}>
              {ownerCreated ? (
                <>
                  <p className="font-bold mb-2" style={{ color: 'var(--color-status-success)' }}>✅ تم إنشاء حساب المالك</p>
                  <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>{ownerEmail}</p>
                </>
              ) : createOwner.isPending ? (
                <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>جاري إنشاء حساب المالك...</p>
              ) : ownerError ? (
                <p className="text-sm" style={{ color: 'var(--color-status-danger)' }}>⚠️ {ownerError}</p>
              ) : null}
            </div>
          )}

          {ownerCreated && (
            <div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-ink-main)' }}>رسالة العميل</p>
              <div className="rounded-xl p-3 text-xs font-mono whitespace-pre-wrap" style={{ background: 'var(--color-ivory-muted)', color: 'var(--color-ink-muted)', maxHeight: '200px', overflow: 'auto' }}>
                {getCredentialMessage()}
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(getCredentialMessage())}>نسخ الرسالة</Button>
                {ownerEmail && (
                  <Button size="sm" variant="primary" onClick={() => window.open(`mailto:${ownerEmail}?subject=حساب TAJ Pharmacy&body=${encodeURIComponent(getCredentialMessage())}`, '_blank')}>
                    فتح البريد
                  </Button>
                )}
              </div>
            </div>
          )}

          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>إغلاق</Button>
        </div>
      )}

      {step === 'owner' && !result && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
    </Modal>
  );
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />;
}
