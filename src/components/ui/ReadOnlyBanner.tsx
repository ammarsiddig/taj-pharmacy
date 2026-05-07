import { ShieldOff } from 'lucide-react';

interface ReadOnlyBannerProps {
  isSuspended: boolean;
}

export default function ReadOnlyBanner({ isSuspended }: ReadOnlyBannerProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border-b border-red-200 text-sm text-status-danger" dir="rtl">
      <ShieldOff size={16} className="shrink-0" />
      <span className="font-medium">
        {isSuspended
          ? 'الحساب موقوف — وضع القراءة فقط. يرجى التواصل مع الدعم لإعادة التفعيل.'
          : 'انتهت صلاحية الاشتراك — وضع القراءة فقط. جدد اشتراكك لاستعادة الصلاحيات الكاملة.'}
      </span>
    </div>
  );
}
