'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { UserRole, Profile, ModulePermission } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Save } from 'lucide-react';

const MODULES = ['Masters', 'Vouchers', 'Pricing', 'Reports', 'Admin'];
const PERMISSIONS = ['can_view', 'can_add', 'can_edit', 'can_delete', 'can_approve'] as const;
const PERM_LABELS: Record<string, string> = { can_view: 'View', can_add: 'Add', can_edit: 'Edit', can_delete: 'Delete', can_approve: 'Approve' };

type PermMatrix = Record<string, Record<string, boolean>>;

function defaultMatrix(): PermMatrix {
  const m: PermMatrix = {};
  for (const mod of MODULES) {
    m[mod] = {};
    for (const p of PERMISSIONS) m[mod][p] = false;
  }
  return m;
}

export default function PermissionsPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [matrix, setMatrix] = useState<PermMatrix>(defaultMatrix());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const { data } = await supabase.from('profiles').select('*').eq('is_active', true).order('full_name');
      if (data) setUsers(data as Profile[]);
    }
    init();
  }, []);

  async function loadPermissions(userId: string) {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('module_permissions').select('*').eq('user_id', userId);
    const m = defaultMatrix();
    for (const perm of (data ?? []) as ModulePermission[]) {
      if (m[perm.module]) {
        for (const p of PERMISSIONS) m[perm.module][p] = (perm as any)[p] ?? false;
      }
    }
    setMatrix(m);
    setLoading(false);
  }

  function handleUserChange(userId: string) {
    setSelectedUser(userId);
    if (userId) loadPermissions(userId);
    else setMatrix(defaultMatrix());
  }

  function togglePerm(mod: string, perm: string) {
    setMatrix(prev => ({
      ...prev,
      [mod]: { ...prev[mod], [perm]: !prev[mod][perm] },
    }));
  }

  function setAll(mod: string, value: boolean) {
    setMatrix(prev => ({
      ...prev,
      [mod]: Object.fromEntries(PERMISSIONS.map(p => [p, value])),
    }));
  }

  async function handleSave() {
    if (!selectedUser) return;
    setSaving(true);
    const supabase = createClient();

    // upsert each module permission
    for (const mod of MODULES) {
      const perms = matrix[mod];
      const { error } = await supabase.from('module_permissions').upsert({
        user_id: selectedUser,
        module: mod,
        ...Object.fromEntries(PERMISSIONS.map(p => [p, perms[p]])),
      }, { onConflict: 'user_id,module' });
      if (error) { toast.error(`Error saving ${mod}: ${error.message}`); setSaving(false); return; }
    }

    toast.success('Permissions saved.');
    setSaving(false);
  }

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (role !== 'admin') return <AccessDenied />;

  const selectedProfile = users.find(u => u.id === selectedUser);

  return (
    <div className="p-6">
      <PageHeader
        title="Module Permissions"
        description="Override role-based permissions for individual users"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Permissions' }]}
        actions={
          selectedUser ? (
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />{saving ? 'Saving...' : 'Save Permissions'}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 max-w-sm">
        <Label className="mb-1.5 block">Select User</Label>
        <Select value={selectedUser} onValueChange={handleUserChange}>
          <SelectTrigger><SelectValue placeholder="Select a user..." /></SelectTrigger>
          <SelectContent>
            {users.map(u => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedUser && selectedProfile && (
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <span className="text-sm text-gray-600">
            Editing permissions for <strong>{selectedProfile.full_name}</strong>
            {' '}<Badge className="ml-1 text-xs">{selectedProfile.role}</Badge>
          </span>
          <span className="text-xs text-gray-400">These override the role defaults.</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading permissions...</div>
      ) : selectedUser ? (
        <div className="grid gap-4">
          {MODULES.map(mod => (
            <Card key={mod}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{mod}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll(mod, true)}>All</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAll(mod, false)}>None</Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <div className="grid grid-cols-5 gap-4">
                  {PERMISSIONS.map(perm => (
                    <div key={perm} className="flex flex-col items-center gap-2">
                      <Label className="text-xs text-gray-500 text-center">{PERM_LABELS[perm]}</Label>
                      <Checkbox
                        checked={matrix[mod][perm]}
                        onCheckedChange={() => togglePerm(mod, perm)}
                        className="w-5 h-5"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Select a user to configure their permissions.</p>
        </div>
      )}
    </div>
  );
}
