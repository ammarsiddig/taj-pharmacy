import { useState, type FormEvent } from 'react';
import { CheckCircle2, Building2, User, ChevronRight, ChevronLeft, Key } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { activateLicenseCloud, completeOnboarding } from '../api';
import type { OnboardingData } from '../types';

interface Props {
  onComplete: () => void;
}

const CURRENCY_OPTIONS = [
  { value: 'SDG', label: 'جنيه سوداني (SDG)' },
  { value: 'USD', label: 'دولار أمريكي (USD)' },
  { value: 'SAR', label: 'ريال سعودي (SAR)' },
  { value: 'AED', label: 'درهم إماراتي (AED)' },
  { value: 'EGP', label: 'جنيه مصري (EGP)' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Africa/Khartoum', label: 'الخرطوم (GMT+3)' },
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'UTC', label: 'UTC (GMT+0)' },
];

const STEPS = [
  { id: 1, labelAr: 'معلومات الصيدلية', icon: Building2 },
  { id: 2, labelAr: 'حساب المدير', icon: User },
  { id: 3, labelAr: 'تفعيل الترخيص', icon: Key },
  { id: 4, labelAr: 'اكتمل', icon: CheckCircle2 },
];

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1 fields
  const [pharmacyName, setPharmacyName] = useState('');
  const [pharmacyNameAr, setPharmacyNameAr] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [currencyCode, setCurrencyCode] = useState('SDG');
  const [timezone, setTimezone] = useState('Africa/Khartoum');
  const [branchName, setBranchName] = useState('');
  const [branchNameAr, setBranchNameAr] = useState('');

  // Step 2 fields
  const [adminUsername, setAdminUsername] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminFullNameAr, setAdminFullNameAr] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  // Step 3 fields
  const [licenseKey, setLicenseKey] = useState('');
  const [activationState, setActivationState] = useState<'idle' | 'success' | 'error'>('idle');
  const [activationMessage, setActivationMessage] = useState('');
  const [activating, setActivating] = useState(false);

  const validateStep1 = () => {
    if (!pharmacyName.trim()) return 'اسم الصيدلية مطلوب';
    return null;
  };

  const validateStep2 = () => {
    if (!adminUsername.trim()) return 'اسم المستخدم مطلوب';
    if (!adminFullName.trim()) return 'الاسم الكامل مطلوب';
    if (ownerEmail.trim() && !ownerEmail.includes('@')) return 'البريد الإلكتروني غير صحيح';
    if (adminPassword.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    if (!/[A-Za-z]/.test(adminPassword) || !/[0-9]/.test(adminPassword)) {
      return 'كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل';
    }
    if (adminPassword !== adminConfirmPassword) return 'كلمتا المرور غير متطابقتين';
    if (!ownerEmail.trim()) return 'البريد الإلكتروني مطلوب لربط الحساب السحابي';
    return null;
  };

  const handleNext = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      setStep(2);
    } else if (step === 2) {
      handleStep2Submit();
    }
  };

  const handleStep2Submit = async () => {
    const err = validateStep2();
    if (err) { setError(err); return; }

    setSaving(true);
    setError('');
    try {
      const data: OnboardingData = {
        pharmacy_name: pharmacyName.trim(),
        pharmacy_name_ar: pharmacyNameAr.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        license_number: licenseNumber.trim() || undefined,
        currency_code: currencyCode,
        timezone,
        branch_name: branchName.trim() || 'Main Branch',
        branch_name_ar: branchNameAr.trim() || 'الفرع الرئيسي',
        admin_username: adminUsername.trim(),
        owner_email: ownerEmail.trim() || undefined,
        admin_full_name: adminFullName.trim(),
        admin_full_name_ar: adminFullNameAr.trim() || undefined,
        admin_password: adminPassword,
      };
      await completeOnboarding(data);
      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCloudActivation = async () => {
    if (!licenseKey.trim()) {
      setActivationState('error');
      setActivationMessage('أدخل مفتاح الترخيص أولاً');
      return;
    }

    setActivating(true);
    setActivationState('idle');
    setActivationMessage('');
    try {
      await activateLicenseCloud({
        key: licenseKey.trim(),
        email: ownerEmail.trim().toLowerCase(),
        password: adminPassword,
        pharmacy_name: pharmacyName.trim(),
      });
      setActivationState('success');
      setActivationMessage('تم تفعيل الترخيص وربط الحساب السحابي بنجاح');
    } catch (err: unknown) {
      setActivationState('error');
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : 'فشل تفعيل الترخيص';
      setActivationMessage(msg);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory-app flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1C5F6F] rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-card">
            <span className="text-white text-2xl font-bold">TAJ</span>
          </div>
          <h1 className="text-2xl font-bold text-ink-main">مرحباً بك في TAJ Pharmacy</h1>
          <p className="text-sm text-ink-muted mt-1">أكمل الإعداد الأولي لبدء الاستخدام</p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isDone = step > s.id;
            const isActive = step === s.id;
            return (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors
                    ${isDone ? 'bg-primary-600 text-white' : isActive ? 'bg-primary-600 text-white ring-4 ring-primary-100' : 'bg-ivory-border text-ink-muted'}`}>
                    {isDone ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                  </div>
                  <span className={`text-xs font-medium ${isActive ? 'text-primary-600' : isDone ? 'text-primary-500' : 'text-ink-muted'}`}>
                    {s.labelAr}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`h-px w-12 mx-1 mb-5 transition-colors ${step > s.id ? 'bg-primary-600' : 'bg-ivory-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-ivory-surface rounded-2xl shadow-card border border-ivory-border p-8">
          {step === 4 ? (
            /* Done screen */
            <div className="flex flex-col items-center gap-6 py-6 text-center">
              <div className="w-20 h-20 rounded-full bg-status-success-bg flex items-center justify-center">
                <CheckCircle2 size={40} className="text-status-success" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-ink-main mb-2">تم الإعداد بنجاح!</h2>
                <p className="text-sm text-ink-muted max-w-sm">
                  تم إعداد الصيدلية وتفعيل الترخيص. يمكنك الآن تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور.
                </p>
              </div>
              <div className="bg-ivory-muted rounded-xl p-4 text-sm text-ink-main w-full max-w-sm text-right">
                <div className="flex justify-between py-1 border-b border-ivory-border">
                  <span className="text-ink-muted">الصيدلية:</span>
                  <span className="font-medium">{pharmacyName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-ivory-border">
                  <span className="text-ink-muted">اسم المستخدم:</span>
                  <span className="font-medium font-mono">{adminUsername}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-ink-muted">البريد الإلكتروني:</span>
                  <span className="font-medium font-mono text-xs">{ownerEmail}</span>
                </div>
              </div>
              <Button size="lg" className="w-full max-w-sm" onClick={onComplete}>
                الذهاب إلى تسجيل الدخول
              </Button>
            </div>
          ) : (
            <form onSubmit={handleNext} className="flex flex-col gap-5">
              {step === 1 && (
                <>
                  <div>
                    <h2 className="text-lg font-bold text-ink-main mb-1">معلومات الصيدلية والفرع</h2>
                    <p className="text-sm text-ink-muted">أدخل البيانات الأساسية للصيدلية والفرع الرئيسي</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="اسم الصيدلية (إنجليزي) *"
                      name="pharmacyName"
                      value={pharmacyName}
                      onChange={(e) => setPharmacyName(e.target.value)}
                      placeholder="TAJ Pharmacy"
                      dir="ltr"
                      required
                    />
                    <Input
                      label="اسم الصيدلية (عربي)"
                      name="pharmacyNameAr"
                      value={pharmacyNameAr}
                      onChange={(e) => setPharmacyNameAr(e.target.value)}
                      placeholder="صيدلية PMS"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="رقم الترخيص"
                      name="licenseNumber"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="LIC-XXXX"
                      dir="ltr"
                    />
                    <Input
                      label="رقم الهاتف"
                      name="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0912345678"
                      dir="ltr"
                    />
                  </div>

                  <Input
                    label="العنوان"
                    name="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="الخرطوم، السودان"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="العملة"
                      name="currency"
                      value={currencyCode}
                      onChange={(e) => setCurrencyCode(e.target.value)}
                      options={CURRENCY_OPTIONS}
                    />
                    <Select
                      label="المنطقة الزمنية"
                      name="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      options={TIMEZONE_OPTIONS}
                    />
                  </div>

                  <div className="border-t border-ivory-border pt-4">
                    <h3 className="text-sm font-semibold text-ink-main mb-3">الفرع الرئيسي</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="اسم الفرع (إنجليزي) *"
                        name="branchName"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        placeholder="Main Branch"
                        dir="ltr"
                        required
                      />
                      <Input
                        label="اسم الفرع (عربي)"
                        name="branchNameAr"
                        value={branchNameAr}
                        onChange={(e) => setBranchNameAr(e.target.value)}
                        placeholder="الفرع الرئيسي"
                      />
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <h2 className="text-lg font-bold text-ink-main mb-1">إعداد حساب المدير</h2>
                    <p className="text-sm text-ink-muted">بيانات الدخول — نفس كلمة المرور تعمل على التطبيق والبوابة الإلكترونية</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="الاسم الكامل (إنجليزي) *"
                      name="adminFullName"
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      placeholder="System Administrator"
                      dir="ltr"
                      required
                    />
                    <Input
                      label="الاسم الكامل (عربي)"
                      name="adminFullNameAr"
                      value={adminFullNameAr}
                      onChange={(e) => setAdminFullNameAr(e.target.value)}
                      placeholder="مدير النظام"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="اسم المستخدم (للتطبيق) *"
                      name="adminUsername"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="admin"
                      dir="ltr"
                      autoComplete="username"
                      required
                    />
                    <Input
                      label="البريد الإلكتروني *"
                      name="ownerEmail"
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="owner@pharmacy.com"
                      dir="ltr"
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="كلمة المرور *"
                      name="adminPassword"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="6 أحرف على الأقل"
                      dir="ltr"
                      autoComplete="new-password"
                      required
                    />
                    <Input
                      label="تأكيد كلمة المرور *"
                      name="adminConfirmPassword"
                      type="password"
                      value={adminConfirmPassword}
                      onChange={(e) => setAdminConfirmPassword(e.target.value)}
                      placeholder="أعد إدخال كلمة المرور"
                      dir="ltr"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <h2 className="text-lg font-bold text-ink-main mb-1">تفعيل الترخيص</h2>
                    <p className="text-sm text-ink-muted">أدخل مفتاح الترخيص الذي تلقيته من مزود البرنامج لتفعيل الاشتراك</p>
                  </div>

                  <Input
                    label="مفتاح الترخيص *"
                    name="licenseKey"
                    value={licenseKey}
                    onChange={(e) => { setLicenseKey(e.target.value); setActivationState('idle'); }}
                    placeholder="PMS-XXXX-XXXX-XXXX"
                    dir="ltr"
                    autoComplete="off"
                  />

                  {activationState !== 'idle' && (
                    <div className={`text-sm px-3 py-2 rounded-xl ${
                      activationState === 'success'
                        ? 'text-status-success bg-status-success-bg'
                        : 'text-status-danger bg-status-danger-bg'
                    }`}>
                      {activationMessage}
                    </div>
                  )}

                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    onClick={handleCloudActivation}
                    disabled={activating || activationState === 'success'}
                  >
                    {activating ? 'جاري التفعيل...' : activationState === 'success' ? '✓ تم التفعيل' : 'تفعيل الترخيص'}
                  </Button>

                  {activationState === 'success' && (
                    <Button
                      type="button"
                      size="lg"
                      variant="primary"
                      className="w-full"
                      onClick={() => setStep(4)}
                    >
                      إنهاء الإعداد
                      <ChevronRight size={16} />
                    </Button>
                  )}

                  {activationState !== 'success' && (
                    <button
                      type="button"
                      className="w-full text-sm text-ink-muted hover:text-ink-main underline underline-offset-2 py-1 transition-colors"
                      onClick={() => setStep(4)}
                      disabled={activating}
                    >
                      تفعيل لاحقاً والمتابعة بدون اشتراك
                    </button>
                  )}
                </>
              )}

              {error && (
                <div className="text-sm text-status-danger bg-status-danger-bg px-3 py-2 rounded-xl">
                  {error}
                </div>
              )}

              {step < 3 && (
                <div className="flex items-center justify-between pt-2">
                  {step > 1 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => { setError(''); setStep(s => s - 1); }}
                      disabled={saving}
                    >
                      <ChevronLeft size={16} />
                      السابق
                    </Button>
                  ) : (
                    <div />
                  )}
                  <Button type="submit" size="lg" disabled={saving}>
                    {saving ? 'جاري الحفظ...' : step === 2 ? 'حفظ والمتابعة' : 'التالي'}
                    {!saving && <ChevronRight size={16} />}
                  </Button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
