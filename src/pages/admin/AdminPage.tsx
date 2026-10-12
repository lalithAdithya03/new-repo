import { useState, type FormEvent } from 'react';
import { Check, Copy, MailPlus, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { must, useAsync } from '@/lib/useAsync';
import { timeAgo } from '@/lib/format';
import { validateEmail } from '@/lib/validation';
import type { Profile, Role } from '@/lib/types';
import { PageHeader, SectionCard } from '@/components/ui/PageHeader';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';

interface Invitation {
  id: string; email: string; institution: string | null; expires_at: string; accepted_at: string | null; revoked: boolean; created_at: string;
}

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [institution, setInstitution] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState('');

  const invites = useAsync(async () => must(await supabase.from('teacher_invitations').select('*').order('created_at', { ascending: false }).limit(50)) as Invitation[], []);
  const users = useAsync(async () => must(await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200)) as Profile[], []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setCode(null); setCopied(false);
    const v = validateEmail(email);
    if (v) { setError(v); return; }
    const { data, error: err } = await supabase.rpc('create_teacher_invite', { p_email: email.trim(), p_institution: institution.trim() || null, p_valid_days: 14 });
    if (err) { setError(err.message); return; }
    setCode(data as string);
    setEmail('');
    invites.reload();
  };

  const revoke = async (id: string) => {
    await supabase.from('teacher_invitations').update({ revoked: true }).eq('id', id);
    invites.reload();
  };

  const setRole = async (user: Profile, role: Role) => {
    const { error: err } = await supabase.rpc('admin_set_role', { p_user_id: user.id, p_role: role });
    if (err) setError(err.message); else users.reload();
  };

  const shownUsers = (users.data ?? []).filter((u) => !userFilter || `${u.full_name} ${u.email}`.toLowerCase().includes(userFilter.toLowerCase()));

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" subtitle="Approve teachers by invitation and manage roles. Only administrators can see this page." />

      <SectionCard title="Invite a teacher" icon={<MailPlus className="h-4 w-4 text-accent" />}>
        <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Teacher's email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Institution (optional)" value={institution} onChange={(e) => setInstitution(e.target.value)} />
          <button className="btn-primary h-[42px]">Create invitation</button>
        </form>
        {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
        {code && (
          <div className="mt-4">
            <Alert tone="success" title="Invitation created. Copy the code now; it is shown only once.">
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-surface px-3 py-1.5 font-mono text-sm" data-testid="invite-code">{code}</code>
                <button className="btn-secondary py-1.5" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); }}>
                  {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                </button>
              </div>
              <p className="mt-2 text-xs">Send it to the teacher with a link to <code>/teacher/onboarding</code>. It works only for that email and expires in 14 days.</p>
            </Alert>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Invitations" icon={<ShieldCheck className="h-4 w-4 text-accent" />}>
        {invites.loading ? <SkeletonRows rows={2} /> : invites.error ? <ErrorState message={invites.error} /> : invites.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Email</th><th>Institution</th><th>Status</th><th>Created</th><th /></tr></thead>
              <tbody className="divide-y divide-border">
                {invites.data.map((i) => {
                  const status = i.revoked ? 'Revoked' : i.accepted_at ? 'Accepted' : new Date(i.expires_at) < new Date() ? 'Expired' : 'Pending';
                  return (
                    <tr key={i.id}>
                      <td className="py-2.5">{i.email}</td><td>{i.institution ?? '—'}</td>
                      <td><span className={`chip ${status === 'Accepted' ? 'text-success' : status === 'Pending' ? 'text-accent' : ''}`}>{status}</span></td>
                      <td className="text-muted">{timeAgo(i.created_at)}</td>
                      <td className="text-right">{status === 'Pending' && <button className="btn-ghost py-1 text-danger" onClick={() => revoke(i.id)}>Revoke</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No invitations yet.</p>}
      </SectionCard>

      <SectionCard title="Users and roles" icon={<Users className="h-4 w-4 text-accent" />}
        action={<input className="input w-48 py-1.5" placeholder="Filter users" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="Filter users" />}>
        {users.loading ? <SkeletonRows rows={3} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
              <tbody className="divide-y divide-border">
                {shownUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 font-medium">{u.full_name}</td><td className="text-muted">{u.email}</td>
                    <td>
                      <select className="input w-auto py-1" value={u.role} onChange={(e) => setRole(u, e.target.value as Role)} aria-label={`Role for ${u.full_name}`}>
                        <option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="text-muted">{timeAgo(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
