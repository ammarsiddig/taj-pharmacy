import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Building2, User, ChevronRight, ChevronLeft, Key, RefreshCw, ArrowRight } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { activateLicenseCloud, completeOnboarding, recoverCloudCredentials, pullAllTables, finalizeRestore } from '../api';
import type { OnboardingData, RestoreResult } from '../types';

const CANONICAL_CLOUD_ENDPOINT = 'https://pharmacy.taj.systems';

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

const CREATE_STEPS = [
  { id: 1, labelAr: 'معلومات الصيدلية', icon: Building2 },
  { id: 2, labelAr: 'حساب المدير', icon: User },
  { id: 3, labelAr: 'تفعيل الترخيص', icon: Key },
  { id: 4, labelAr: 'اكتمل', icon: CheckCircle2 },
];

const RESTORE_STEPS = [
  { id: 'form', labelAr: 'بيانات الحساب', icon: Key },
  { id: 'progress', labelAr: 'استعادة البيانات', icon: RefreshCw },
  { id: 'done', labelAr: 'اكتمل', icon: CheckCircle2 },
];

type Mode = null | 'create' | 'restore';
type RestoreStep = 'form' | 'progress' | 'done';

export default function Onboarding({ onComplete }: Props) {
  const { t } = useTranslation();

  // Top-level mode: null = Step 0 branch screen
  const [mode, setMode] = useState<Mode>(null);

  // ── Create-new flow state ──────────────────────────────────────────────────
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
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailAvailable, setEmailAvailable] = useState(false);

  // ── Restore flow state ────────────────────────────────────────────────────
  const [restoreStep, setRestoreStep] = useState<RestoreStep>('form');
  const [restoreLicenseKey, setRestoreLicenseKey] = useState('');
  const [restoreEmail, setRestoreEmail] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoreProgressMsg, setRestoreProgressMsg] = useState('');
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restorePharmacyName, setRestorePharmacyName] = useState('');

  // ── Create-new helpers ────────────────────────────────────────────────────
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
    if (emailError) return emailError;
    if (emailAvailable && !emailChecking) return null;
    if (ownerEmail.includes('@') && !emailAvailable && !emailChecking) return 'جاري التحقق من البريد الإلكتروني...';
    return null;
  };

  const checkEmail = async () => {
    const email = ownerEmail.trim();
    if (!email || !email.includes('@')) return;
    setEmailChecking(true);
    setEmailError('');
    setEmailAvailable(false);
    try {
      const res = await fetch(`${CANONICAL_CLOUD_ENDPOINT}/v1/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.exists) {
        setEmailError('هذا البريد مسجّل بصيدلية أخرى. استخدم بريداً مختلفاً أو سجّل دخولك من خيار \'استعادة صيدلية موجودة\'.');
        setEmailAvailable(false);
      } else {
        setEmailError('');
        setEmailAvailable(true);
      }
    } catch {
      // Allow proceeding if cloud is unreachable
      setEmailAvailable(true);
    } finally {
      setEmailChecking(false);
    }
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
        branch_name: branchName.trim() || 'الفرع الرئيسي',
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
      const raw = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
      const msg =
        raw.includes('already exists') || raw.includes('already registered')
          ? 'هذا البريد الإلكتروني مسجل لصيدلية أخرى. استخدم بريدًا مختلفًا أو تواصل مع الدعم.'
          : raw.includes('Invalid or already used')
          ? 'مفتاح الترخيص غير صالح أو تم استخدامه من قبل.'
          : raw.includes('expired')
          ? 'مفتاح الترخيص منتهي الصلاحية. تواصل مع الدعم للتجديد.'
          : raw || 'فشل تفعيل الترخيص. تحقق من المفتاح والبريد الإلكتروني وحاول مجدداً.';
      setActivationMessage(msg);
    } finally {
      setActivating(false);
    }
  };

  // ── Restore flow helpers ──────────────────────────────────────────────────
  const validateRestoreForm = () => {
    if (!restoreLicenseKey.trim()) return 'مفتاح الترخيص مطلوب';
    if (!restoreEmail.trim() || !restoreEmail.includes('@')) return 'أدخل بريداً إلكترونياً صحيحاً';
    if (!restorePassword) return 'كلمة المرور مطلوبة';
    return null;
  };

  const handleRestoreSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateRestoreForm();
    if (err) { setRestoreError(err); return; }

    setRestoreError('');
    setRestoreStep('progress');
    setRestoreProgressMsg('جاري التحقق من بيانات الاعتماد...');

    try {
      // Step R2: verify credentials and get sync token
      const recovered = await recoverCloudCredentials(
        restoreLicenseKey.trim(),
        restoreEmail.trim(),
        restorePassword,
      );
      setRestorePharmacyName(recovered.pharmacy_name);

      // Step R3: pull all tables
      setRestoreProgressMsg('جاري استعادة بيانات الصيدلية من السحابة...');
      const result = await pullAllTables(CANONICAL_CLOUD_ENDPOINT, recovered.sync_token);

      // Step R4: persist sync token + mark onboarding complete + reset admin password
      setRestoreProgressMsg('جاري حفظ إعدادات الحساب...');
      await finalizeRestore(recovered.sync_token, CANONICAL_CLOUD_ENDPOINT, restorePassword, recovered.pharmacy_name);

      setRestoreResult(result);
      setRestoreStep('done');
    } catch (err: unknown) {
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : 'فشل الاستعادة';
      setRestoreError(msg);
      setRestoreStep('form');
    }
  };

  // ── Progress bar rendering ────────────────────────────────────────────────
  const renderProgressBar = () => {
    if (mode === null) return null;

    if (mode === 'create') {
      return (
        <div className="flex items-center justify-center gap-0 mb-8">
          {CREATE_STEPS.map((s, idx) => {
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
                {idx < CREATE_STEPS.length - 1 && (
                  <div className={`h-px w-12 mx-1 mb-5 transition-colors ${step > s.id ? 'bg-primary-600' : 'bg-ivory-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // restore mode
    const restoreStepOrder: RestoreStep[] = ['form', 'progress', 'done'];
    const currentRestoreIdx = restoreStepOrder.indexOf(restoreStep);
    return (
      <div className="flex items-center justify-center gap-0 mb-8">
        {RESTORE_STEPS.map((s, idx) => {
          const Icon = s.icon;
          const sIdx = restoreStepOrder.indexOf(s.id as RestoreStep);
          const isDone = currentRestoreIdx > sIdx;
          const isActive = currentRestoreIdx === sIdx;
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
              {idx < RESTORE_STEPS.length - 1 && (
                <div className={`h-px w-12 mx-1 mb-5 transition-colors ${currentRestoreIdx > sIdx ? 'bg-primary-600' : 'bg-ivory-border'}`} />
              )}
            </div>
          );
        })}
      </div>
    );
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
          <p className="text-sm text-ink-muted mt-1">
            {mode === null
              ? 'اختر كيف تريد البدء'
              : mode === 'restore'
              ? 'استعادة بيانات صيدليتك الموجودة'
              : 'أكمل الإعداد الأولي لبدء الاستخدام'}
          </p>
        </div>

        {/* Progress bar (hidden on Step 0) */}
        {renderProgressBar()}

        {/* ── Step 0: Branch selection ──────────────────────────────────────── */}
        {mode === null && (
          <div className="bg-ivory-surface rounded-2xl shadow-card border border-ivory-border p-8">
            <div className="text-center mb-8">
              <h2 className="text-lg font-bold text-ink-main mb-2">هل لديك حساب TAJ Pharmacy بالفعل؟</h2>
              <p className="text-sm text-ink-muted">اختر الخيار المناسب لحالتك</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Create new */}
              <button
                type="button"
                onClick={() => setMode('create')}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-ivory-border hover:border-primary-400 hover:bg-primary-50 transition-all text-center group"
              >
                <div className="w-14 h-14 rounded-xl bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                  <Building2 size={28} className="text-primary-600" />
                </div>
                <div>
                  <div className="font-bold text-ink-main text-base mb-1">صيدلية جديدة</div>
                  <div className="text-xs text-ink-muted leading-relaxed">لم تستخدم TAJ من قبل — ابدأ من الصفر بدون بيانات سابقة</div>
                </div>
                <ArrowRight size={16} className="text-primary-400 group-hover:text-primary-600 transition-colors" />
              </button>

              {/* Restore existing */}
              <button
                type="button"
                onClick={() => setMode('restore')}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-ivory-border hover:border-teal-400 hover:bg-teal-50 transition-all text-center group"
              >
                <div className="w-14 h-14 rounded-xl bg-teal-100 flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                  <RefreshCw size={28} className="text-teal-600" />
                </div>
                <div>
                  <div className="font-bold text-ink-main text-base mb-1">استعادة صيدلية موجودة</div>
                  <div className="text-xs text-ink-muted leading-relaxed">لديك حساب TAJ وتريد نقل بياناتك إلى جهاز جديد أو فرع آخر</div>
                </div>
                <ArrowRight size={16} className="text-teal-400 group-hover:text-teal-600 transition-colors" />
              </button>
            </div>
          </div>
        )}

        {/* ── Create-new flow ───────────────────────────────────────────────── */}
        {mode === 'create' && (
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
                        placeholder={t('onboarding.pharmacyNamePlaceholder')}
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
                        placeholder={t('onboarding.licensePlaceholder')}
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
                          placeholder={t('onboarding.mainBranchPlaceholder')}
                          dir="ltr"
                        required
                      />
                      {emailChecking && (
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          <RefreshCw size={12} className="animate-spin" />
                          جاري التحقق من البريد...
                        </div>
                      )}
                      {emailError && (
                        <div className="text-xs text-status-danger">{emailError}</div>
                      )}
                      {emailAvailable && !emailChecking && ownerEmail.includes('@') && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 size={12} />
                          البريد متاح
                        </div>
                      )}
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
                        placeholder={t('onboarding.adminNamePlaceholder')}
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
                        placeholder={t('onboarding.usernamePlaceholder')}
                        dir="ltr"
                        autoComplete="username"
                        required
                      />
                      <Input
                        label="البريد الإلكتروني *"
                        name="ownerEmail"
                        type="email"
                        value={ownerEmail}
                        onChange={(e) => { setOwnerEmail(e.target.value); setEmailAvailable(false); setEmailError(''); }}
                        onBlur={checkEmail}
                        placeholder={t('onboarding.emailPlaceholder')}
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
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => { setError(''); setMode(null); }}
                        disabled={saving}
                      >
                        <ChevronLeft size={16} />
                        رجوع
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="lg"
                      disabled={
                        saving ||
                        (step === 1 && !pharmacyName.trim()) ||
                        (step === 2 && (emailChecking || (ownerEmail.includes('@') && !emailAvailable)))
                      }
                    >
                      {saving ? 'جاري الحفظ...' : step === 2 ? 'حفظ والمتابعة' : 'التالي'}
                      {!saving && <ChevronRight size={16} />}
                    </Button>
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {/* ── Restore flow ──────────────────────────────────────────────────── */}
        {mode === 'restore' && (
          <div className="bg-ivory-surface rounded-2xl shadow-card border border-ivory-border p-8">

            {/* R1: Credentials form */}
            {restoreStep === 'form' && (
              <form onSubmit={handleRestoreSubmit} className="flex flex-col gap-5">
                <div>
                  <h2 className="text-lg font-bold text-ink-main mb-1">استعادة صيدلية موجودة</h2>
                  <p className="text-sm text-ink-muted">
                    أدخل بيانات حسابك لاستعادة جميع بيانات صيدليتك على هذا الجهاز
                  </p>
                </div>

                <Input
                  label="مفتاح الترخيص *"
                  name="restoreLicenseKey"
                  value={restoreLicenseKey}
                  onChange={(e) => { setRestoreLicenseKey(e.target.value); setRestoreError(''); }}
                  placeholder="TAJ-XXXX-XXXX-XXXX-XXXX"
                  dir="ltr"
                  autoComplete="off"
                  required
                />

                <Input
                  label="البريد الإلكتروني للمالك *"
                  name="restoreEmail"
                  type="email"
                  value={restoreEmail}
                  onChange={(e) => { setRestoreEmail(e.target.value); setRestoreError(''); }}
                  placeholder={t('onboarding.emailPlaceholder')}
                  dir="ltr"
                  autoComplete="email"
                  required
                />

                <Input
                  label="كلمة المرور *"
                  name="restorePassword"
                  type="password"
                  value={restorePassword}
                  onChange={(e) => { setRestorePassword(e.target.value); setRestoreError(''); }}
                  placeholder="كلمة مرور حساب TAJ"
                  dir="ltr"
                  autoComplete="current-password"
                  required
                />

                {restoreError && (
                  <div className="text-sm text-status-danger bg-status-danger-bg px-3 py-2 rounded-xl">
                    {restoreError}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setRestoreError(''); setMode(null); }}
                  >
                    <ChevronLeft size={16} />
                    رجوع
                  </Button>
                  <Button type="submit" size="lg">
                    استعادة البيانات
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </form>
            )}

            {/* R2/R3: Progress spinner */}
            {restoreStep === 'progress' && (
              <div className="flex flex-col items-center gap-6 py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
                  <RefreshCw size={32} className="text-primary-600 animate-spin" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink-main mb-2">جاري الاستعادة</h2>
                  <p className="text-sm text-ink-muted">{restoreProgressMsg}</p>
                </div>
                <p className="text-xs text-ink-muted max-w-xs">
                  قد تستغرق هذه العملية دقيقة أو دقيقتين حسب حجم البيانات. لا تغلق التطبيق.
                </p>
              </div>
            )}

            {/* R4: Done summary */}
            {restoreStep === 'done' && restoreResult && (
              <div className="flex flex-col items-center gap-6 py-6 text-center">
                <div className="w-20 h-20 rounded-full bg-status-success-bg flex items-center justify-center">
                  <CheckCircle2 size={40} className="text-status-success" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-ink-main mb-2">تمت الاستعادة بنجاح!</h2>
                  {restorePharmacyName && (
                    <p className="text-sm font-medium text-primary-600 mb-1">{restorePharmacyName}</p>
                  )}
                  <p className="text-sm text-ink-muted max-w-sm">
                    تم استرجاع بيانات صيدليتك. سجّل الدخول باسم المستخدم <span className="font-mono font-semibold text-ink-main">admin</span> وكلمة المرور التي أدخلتها.
                  </p>
                </div>
                <div className="bg-ivory-muted rounded-xl p-4 text-sm text-ink-main w-full max-w-sm text-right">
                  {Object.entries(restoreResult.tables).map(([table, count]) =>
                    count > 0 ? (
                      <div key={table} className="flex justify-between py-1 border-b border-ivory-border last:border-0">
                        <span className="text-ink-muted">{table}</span>
                        <span className="font-medium font-mono">{count.toLocaleString()} سجل</span>
                      </div>
                    ) : null
                  )}
                  <div className="flex justify-between py-1 pt-2 border-t border-ivory-border font-semibold">
                    <span className="text-ink-main">الإجمالي</span>
                    <span className="text-primary-600">{restoreResult.total_rows.toLocaleString()} سجل</span>
                  </div>
                </div>
                <Button size="lg" className="w-full max-w-sm" onClick={onComplete}>
                  الذهاب إلى تسجيل الدخول
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
