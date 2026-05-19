import { useState } from 'react';
import { clearAdminToken } from '../api';
import AdminShell from './admin/AdminShell';
import TenantsView from './admin/TenantsView';
import CreatePharmacyDialog from './admin/CreatePharmacyDialog';
import AdminTenantDetail from './AdminTenantDetail';
import AdminLicenses from './AdminLicenses';
import AdminRenewals from './AdminRenewals';
import AdminTrash from './AdminTrash';
import AdminAudit from './AdminAudit';

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
      {view === 'licenses' && <AdminLicenses />}
      {view === 'renewals' && <AdminRenewals />}
      {view === 'trash' && <AdminTrash />}
      {view === 'audit' && <AdminAudit />}

      <CreatePharmacyDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </AdminShell>
  );
}
