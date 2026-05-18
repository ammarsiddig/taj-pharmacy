import { useState } from 'react';
import { clearAdminToken } from '../api';
import AdminShell from './admin/AdminShell';
import TenantsView from './admin/TenantsView';
import CreatePharmacyDialog from './admin/CreatePharmacyDialog';
import AdminTenantDetail from './AdminTenantDetail';

type AdminView = 'tenants' | 'licenses' | 'renewals' | 'trash' | 'audit';

interface Props {
  onLogout: () => void;
}

export default function AdminPanel({ onLogout }: Props) {
  const [view, setView] = useState<AdminView>('tenants');
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  if (selectedTenant) {
    return (
      <AdminTenantDetail
        tenantId={selectedTenant}
        onBack={() => setSelectedTenant(null)}
      />
    );
  }

  return (
    <AdminShell view={view} onNavigate={(v) => setView(v as AdminView)} onLogout={handleLogout}>
      {view === 'tenants' && (
        <TenantsView
          onSelect={(id) => setSelectedTenant(id)}
          onCreateClick={() => setShowCreate(true)}
        />
      )}
      {view === 'licenses' && (
        <div className="text-center py-10" style={{ color: 'var(--color-ink-muted)' }}>
          <p className="text-4xl mb-3">🔑</p>
          <p className="font-medium">مفاتيح الترخيص</p>
          <p className="text-sm mt-1">قريباً</p>
        </div>
      )}
      {view === 'renewals' && (
        <div className="text-center py-10" style={{ color: 'var(--color-ink-muted)' }}>
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium">التجديدات</p>
          <p className="text-sm mt-1">قريباً</p>
        </div>
      )}
      {view === 'trash' && (
        <div className="text-center py-10" style={{ color: 'var(--color-ink-muted)' }}>
          <p className="text-4xl mb-3">🗑️</p>
          <p className="font-medium">المحذوفات</p>
          <p className="text-sm mt-1">قريباً</p>
        </div>
      )}
      {view === 'audit' && (
        <div className="text-center py-10" style={{ color: 'var(--color-ink-muted)' }}>
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">سجل التدقيق</p>
          <p className="text-sm mt-1">قريباً</p>
        </div>
      )}

      <CreatePharmacyDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </AdminShell>
  );
}
