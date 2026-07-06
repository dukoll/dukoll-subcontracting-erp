'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Pencil, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, roleLabel } from '@/lib/utils';
import type { UserRole, Profile } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-800',
  accounting: 'bg-indigo-100 text-indigo-800',
  store: 'bg-green-100 text-green-800',
  production: 'bg-orange-100 text-orange-800',
  viewer: 'bg-gray-100 text-gray-800',
};

const ALL_ROLES: UserRole[] = ['admin', 'accounting', 'store', 'production', 'viewer'];

const EMPTY_FORM = { full_name: '', phone: '', role: 'viewer' as UserRole, is_active: true };
const EMPTY_CREATE = { username: '', email: '', password: '', full_name: '', role: 'viewer' as UserRole };

export default function UsersPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
    }
    init();
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    if (data) setUsers(data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (role === 'admin') loadUsers(); }, [role, loadUsers]);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (role !== 'admin') return <AccessDenied />;

  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(user: Profile) {
    setEditing(user);
    setForm({ full_name: user.full_name, phone: user.phone ?? '', role: user.role, is_active: user.is_active });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    if (!form.full_name.trim()) { toast.error('Full name is required.'); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      role: form.role,
      is_active: form.is_active,
    }).eq('id', editing.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('User updated.');
    setSaving(false);
    setDialogOpen(false);
    loadUsers();
  }

  async function toggleActive(user: Profile) {
    const supabase = createClient();
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    if (error) toast.error(error.message);
    else { toast.success(`User ${user.is_active ? 'deactivated' : 'activated'}.`); loadUsers(); }
  }

  function openCreate() {
    setCreateForm(EMPTY_CREATE);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!createForm.username.trim() || !createForm.email.trim() || !createForm.password) {
      toast.error('Username, email and password are required.'); return;
    }
    if (createForm.password.length < 6) { toast.error('Password must be at least 6 characters.'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create user');
      toast.success('User created.');
      setCreateOpen(false);
      loadUsers();
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="User Management"
        description="Create users and manage their roles and access"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Users' }]}
        actions={
          <Button onClick={openCreate}><UserPlus className="w-4 h-4 mr-1" />New User</Button>
        }
      />

      <div className="mb-4">
        <Input className="w-64" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No users found" description="No users match your search." />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(user => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell className="text-sm text-gray-600">{user.email}</TableCell>
                  <TableCell>
                    <Badge className={ROLE_BADGE[user.role]}>{roleLabel(user.role)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{user.phone ?? '—'}</TableCell>
                  <TableCell>
                    <button onClick={() => toggleActive(user)} className="focus:outline-none">
                      {user.is_active
                        ? <Badge className="bg-green-100 text-green-800 cursor-pointer">Active</Badge>
                        : <Badge variant="secondary" className="cursor-pointer">Inactive</Badge>}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(user.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(user)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User — {editing?.email}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
            </div>
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => (
                    <SelectItem key={r} value={r}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[r]}`}>{roleLabel(r)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label>Active Account</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Username *</Label>
                <Input value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. ramesh" />
              </div>
              <div className="grid gap-1.5">
                <Label>Full Name</Label>
                <Input value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ramesh Patel" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Email *</Label>
              <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="ramesh@dukoll.in" />
            </div>
            <div className="grid gap-1.5">
              <Label>Password *</Label>
              <Input type="text" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
            </div>
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => (
                    <SelectItem key={r} value={r}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[r]}`}>{roleLabel(r)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500">The user can sign in with either the username or the email, using this password.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? 'Creating...' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
