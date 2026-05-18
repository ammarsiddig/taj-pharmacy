import { useState } from 'react';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface InstallBannerProps {
  canInstall: boolean;
  isIOS: boolean;
  onInstall: () => Promise<boolean | undefined>;
  compact?: boolean;
}

export default function InstallBanner({ canInstall, isIOS, onInstall, compact }: InstallBannerProps) {
  const [installing, setInstalling] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  if (!canInstall) return null;

  async function handleInstall() {
    setInstalling(true);
    const ok = await onInstall();
    setInstalling(false);
    if (!ok && isIOS) setShowIOSHelp(true);
  }

  return (
    <>
      {compact ? (
        <button onClick={handleInstall} disabled={installing} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold touch-target">
          <Icon name="download" size={16} />
          {installing ? '...جاري' : 'تثبيت التطبيق'}
        </button>
      ) : (
        <div className="fixed bottom-0 start-0 end-0 z-[80] p-4 safe-pb" style={{ background: 'var(--color-primary-950)', color: 'white' }}>
          <div className="flex items-center gap-3 max-w-md mx-auto">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
              <img src="/taj-logo.svg" alt="TAJ Pharmacy" className="h-8 w-8 object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">تطبيق TAJ Pharmacy</p>
              <p className="text-xs opacity-70">{isIOS ? 'أضفه للشاشة الرئيسية' : 'ثبته للوصول السريع'}</p>
            </div>
            <Button onClick={handleInstall} loading={installing} variant="primary" size="sm">
              تثبيت
            </Button>
          </div>
        </div>
      )}

      {isIOS && (
        <Modal open={showIOSHelp} onClose={() => setShowIOSHelp(false)} title="تثبيت التطبيق">
          <div className="text-center">
            <p className="text-sm text-ink-muted mb-4">
              لتثبيت التطبيق على جهازك، اضغط على زر
              <span className="inline-flex align-middle mx-1">
                <Icon name="share" size={18} />
              </span>
              في المتصفح ثم اختر "إضافة إلى الشاشة الرئيسية"
            </p>
            <Button onClick={() => setShowIOSHelp(false)} variant="secondary">حسناً</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
