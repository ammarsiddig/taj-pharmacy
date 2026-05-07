import { useState, useEffect } from 'react';
import { listPharmacies, addPharmacy, removePharmacy } from '../../api/system';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import type { PharmacyConfig, PharmacyConfigInput } from '../../types';

const inp = 'w-full rounded-xl border border-ivory-border bg-surface-secondary px-4 py-2.5 text-sm text-ink-main outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

export default function PharmacyManagementTab() {
  const [pharmacies, setPharmacies] = useState<PharmacyConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  const [newPharmacy, setNewPharmacy] = useState<PharmacyConfigInput>({
    tenant_id: '',
    name: '',
    name_ar: '',
    cloud_endpoint: 'http://178.104.158.147',
    cloud_token: '',
  });

  useEffect(() => {
    loadPharmacies();
  }, []);

  const loadPharmacies = async () => {
    setLoading(true);
    try {
      const list = await listPharmacies();
      setPharmacies(list);
    } catch (err) {
      setToast({ type: 'danger', msg: 'فشل تحميل قائمة الصيدليات: ' + err });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newPharmacy.tenant_id.trim() || !newPharmacy.name.trim()) {
      setToast({ type: 'danger', msg: 'معرف الصيدلية والاسم مطلوبان' });
      return;
    }

    setSaving(true);
    try {
      await addPharmacy(newPharmacy);
      setToast({ type: 'success', msg: 'تم إضافة الصيدلية بنجاح' });
      setShowAdd(false);
      setNewPharmacy({
        tenant_id: '',
        name: '',
        name_ar: '',
        cloud_endpoint: 'http://178.104.158.147',
        cloud_token: '',
      });
      await loadPharmacies();
    } catch (err) {
      setToast({ type: 'danger', msg: 'فشل إضافة الصيدلية: ' + err });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (tenantId: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف "${name}" من القائمة؟\n\nملاحظة: لن يتم حذف بيانات الصيدلية، فقط إزالتها من قائمة التبديل.`)) {
      return;
    }

    try {
      await removePharmacy(tenantId);
      setToast({ type: 'success', msg: 'تم إزالة الصيدلية من القائمة' });
      await loadPharmacies();
    } catch (err) {
      setToast({ type: 'danger', msg: 'فشل إزالة الصيدلية: ' + err });
    }
  };

  if (loading) {
    return (
      <div className="app-card py-12 text-center text-ink-muted">
        جاري تحميل الصيدليات...
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="app-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink-main">إدارة الصيدليات</h3>
            <p className="text-sm text-ink-muted">إضافة وتبديل بين صيدليات متعددة (وضع المشرف)</p>
          </div>
          <Button onClick={() => setShowAdd(true)} disabled={showAdd}>
            + إضافة صيدلية
          </Button>
        </div>

        {pharmacies.length === 0 ? (
          <div className="rounded-xl border border-ivory-border bg-surface-secondary p-8 text-center">
            <p className="text-ink-muted">لم تتم إضافة أي صيدليات بعد</p>
            <p className="mt-2 text-xs text-ink-muted">
              أضف صيدليتك الأولى للبدء في إدارة متعددة الصيدليات
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pharmacies.map((p) => (
              <div 
                key={p.tenant_id} 
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  p.is_active ? 'border-primary-600 bg-primary-50' : 'border-ivory-border bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-3 w-3 rounded-full ${
                    p.is_active ? 'bg-primary-600' : 'bg-ink-placeholder'
                  }`} />
                  <div>
                    <p className="font-semibold text-ink-main">
                      {p.name_ar || p.name}
                      {p.is_active && (
                        <span className="me-2 rounded-full bg-primary-600 px-2 py-0.5 text-xs text-white">
                          نشط
                        </span>
                      )}
                      {p.is_default && (
                        <span className="me-2 rounded-full bg-ivory-border px-2 py-0.5 text-xs text-ink-muted">
                          افتراضي
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-muted">{p.tenant_id}</p>
                    <p className="mt-1 text-xs text-ink-muted" dir="ltr">
                      {p.cloud_endpoint}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(p.tenant_id, p.name_ar || p.name)}
                  className="rounded-lg px-3 py-1.5 text-sm text-status-danger hover:bg-red-50"
                  disabled={p.is_active}
                  title={p.is_active ? 'لا يمكن حذف الصيدلية النشطة' : 'حذف من القائمة'}
                >
                  {p.is_active ? 'نشط' : 'حذف'}
                </button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="mt-6 rounded-xl border border-primary-600 bg-primary-50 p-5">
            <h4 className="mb-4 font-bold text-primary-800">إضافة صيدلية جديدة</h4>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-main">
                  معرف الصيدلية (Tenant ID) <span className="text-status-danger">*</span>
                </label>
                <input
                  className={inp}
                  value={newPharmacy.tenant_id}
                  onChange={(e) => setNewPharmacy({ ...newPharmacy, tenant_id: e.target.value })}
                  placeholder="مثال: alshifa-pharmacy"
                  dir="ltr"
                />
                <p className="mt-1 text-xs text-ink-muted">المعرف الفريد من لوحة تحكم المالك</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-main">
                    اسم الصيدلية <span className="text-status-danger">*</span>
                  </label>
                  <input
                    className={inp}
                    value={newPharmacy.name}
                    onChange={(e) => setNewPharmacy({ ...newPharmacy, name: e.target.value })}
                    placeholder="مثال: Al-Shifa Pharmacy"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-main">
                    الاسم بالعربية
                  </label>
                  <input
                    className={inp}
                    value={newPharmacy.name_ar}
                    onChange={(e) => setNewPharmacy({ ...newPharmacy, name_ar: e.target.value })}
                    placeholder="مثال: صيدلية الشفاء"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-main">
                  رابط خادم المزامنة
                </label>
                <input
                  className={inp}
                  value={newPharmacy.cloud_endpoint}
                  onChange={(e) => setNewPharmacy({ ...newPharmacy, cloud_endpoint: e.target.value })}
                  placeholder="http://178.104.158.147"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-main">
                  رمز المزامنة (Sync Token) <span className="text-status-danger">*</span>
                </label>
                <input
                  className={inp}
                  type="password"
                  value={newPharmacy.cloud_token}
                  onChange={(e) => setNewPharmacy({ ...newPharmacy, cloud_token: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  dir="ltr"
                />
                <p className="mt-1 text-xs text-ink-muted">الرمز من لوحة تحكم المالك بعد إنشاء الصيدلية</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? 'جاري الحفظ...' : 'حفظ الصيدلية'}
                </Button>
                <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={saving}>
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-ivory-border bg-surface-secondary p-4 text-xs text-ink-muted">
        <strong className="text-ink-main">💡 دليل استخدام وضع المشرف:</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>أضف كل صيدلية باستخدام معرفها ورمز المزامنة من لوحة المالك</li>
          <li>يتم إنشاء قاعدة بيانات منفصلة لكل صيدلية</li>
          <li>استخدم قائمة التبديل في الشريط العلوي للتنقل بين الصيدليات</li>
          <li>يتطلب التبديل إعادة تشغيل التطبيق لتحميل بيانات الصيدلية الجديدة</li>
        </ul>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
