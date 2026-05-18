import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenantDetail, getLatestDownload, type AdminTenant, type LicenseKey } from '../api';

export function useTenants(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['tenants', params],
    queryFn: async () => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      const res = await fetch(`/admin/tenants${qs}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ tenants: AdminTenant[]; total: number; page: number; limit: number }>;
    },
    staleTime: 30_000,
  });
}

export function useTenant(id: string | null) {
  return useQuery({
    queryKey: ['tenant', id],
    queryFn: () => getTenantDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      const res = await fetch('/admin/overview', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useLicenses() {
  return useQuery({
    queryKey: ['licenses'],
    queryFn: async () => {
      const res = await fetch('/admin/licenses', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ keys: LicenseKey[] }>;
    },
    staleTime: 30_000,
  });
}

export function useTrash() {
  return useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const res = await fetch('/admin/trash', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ tenants: AdminTenant[] }>;
    },
    staleTime: 30_000,
  });
}

export function useAuditLog(tenantId?: string) {
  return useQuery({
    queryKey: ['audit', tenantId],
    queryFn: async () => {
      const params = tenantId ? `?tenant_id=${tenantId}` : '';
      const res = await fetch(`/admin/audit${params}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 15_000,
  });
}

export function useDownloadLink() {
  return useQuery({
    queryKey: ['download'],
    queryFn: getLatestDownload,
    staleTime: 300_000,
  });
}

export function useRenew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const res = await fetch(`/admin/tenants/${id}/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}`,
        },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenant'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useSuspend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_suspended, suspended_reason }: { id: string; is_suspended: boolean; suspended_reason?: string }) => {
      const res = await fetch(`/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}`,
        },
        body: JSON.stringify({ is_suspended, suspended_reason }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenant'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hard, confirm }: { id: string; hard?: boolean; confirm?: string }) => {
      const params = new URLSearchParams();
      if (hard) params.set('hard', 'true');
      if (confirm) params.set('confirm', confirm);
      const res = await fetch(`/admin/tenants/${id}?${params.toString()}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

export function useRestoreTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/admin/tenants/${id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['trash'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useCreateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { pharmacy_name: string; days: number; create_new_tenant?: boolean; tenant_id?: string; plan?: string; max_users?: number; max_branches?: number }) => {
      const res = await fetch('/admin/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}`,
        },
        body: JSON.stringify({
          pharmacy_name: data.pharmacy_name,
          expires_in_days: data.days,
          create_new_tenant: data.create_new_tenant !== false,
          tenant_id: data.tenant_id,
          plan: data.plan || 'basic',
          max_users: data.max_users || 5,
          max_branches: data.max_branches || 3,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ key: string; tenant_id: string; sync_token: string; expires_at: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['licenses'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useCreateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, email, password }: { tenantId: string; email: string; password: string }) => {
      const res = await fetch(`/admin/tenants/${tenantId}/create-owner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}`,
        },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Owner creation failed');
      return body;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['tenant', vars.tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

export function useResetOwnerPassword() {
  return useMutation({
    mutationFn: async ({ tenantId, password }: { tenantId: string; password: string }) => {
      const res = await fetch(`/admin/tenants/${tenantId}/reset-owner-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}`,
        },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Reset failed');
      return body;
    },
  });
}

export function useBroadcast() {
  return useMutation({
    mutationFn: async (data: { message: string; type?: string; status?: string }) => {
      const res = await fetch('/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });
}

export function useRefreshRequest() {
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await fetch(`/admin/tenants/${tenantId}/refresh-request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionStorage.getItem('pms_admin_token') || ''}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });
}
