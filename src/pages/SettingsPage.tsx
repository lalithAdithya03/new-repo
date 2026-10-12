import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Palette, ShieldCheck, User } from 'lucide-react';
import { useAuth, dashboardFor } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError } from '@/lib/authErrors';
import { validateInviteCode, validateName, validateNewPassword } from '@/lib/validation';
import { PageHeader, SectionCard } from '@/components/ui/PageHeader';
import { Field, PasswordField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { ThemePicker } from '@/components/ThemeSwitcher';

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [institution, setInstitution] = useState(profile?.institution ?? '');
  const [profileMsg, setProfileMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [password, setPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateName(name);
    if (err) { setProfileMsg({ tone: 'error', text: err }); return; }
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), institution: institution.trim() || null }).eq('id', profile!.id);
    setProfileMsg(error ? { tone: 'error', text: error.message } : { tone: 'success', text: 'Profile saved.' });
    if (!error) refreshProfile();
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateNewPassword(password);
    if (err) { setPwMsg({ tone: 'error', text: err }); return; }
    const { error } = await supabase.auth.updateUser({ password });
    setPwMsg(error ? { tone: 'error', text: friendlyAuthError(error) } : { tone: 'success', text: 'Password updated.' });
    if (!error) setPassword('');
  };

  const redeem = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateInviteCode(code);
    if (err) { setCodeMsg({ tone: 'error', text: err }); return; }
    const { data, error } = await supabase.rpc('redeem_teacher_invite', { p_code: code.trim().toUpperCase() });
    if (error) { setCodeMsg({ tone: 'error', text: error.message }); return; }
    setCodeMsg({ tone: 'success', text: 'Teacher access granted. Taking you to the teacher dashboard…' });
    await refreshProfile();
    setTimeout(() => navigate(dashboardFor(data as 'teacher'), { replace: true }), 900);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Your profile, appearance and account security." />

      <SectionCard title="Profile" icon={<User className="h-4 w-4 text-accent" />}>
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Institution" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Optional" />
          <Field label="Email" value={profile?.email ?? ''} disabled hint="Managed by your sign-in account." />
          <Field label="Role" value={profile?.role ?? ''} disabled className="capitalize" hint="Roles are assigned by your institution, not here." />
          <div className="sm:col-span-2 flex items-center gap-3">
            <button className="btn-primary">Save profile</button>
            {profileMsg && <span className={`text-sm ${profileMsg.tone === 'error' ? 'text-danger' : 'text-success'}`} role="status">{profileMsg.text}</span>}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Appearance" icon={<Palette className="h-4 w-4 text-accent" />}>
        <p className="mb-3 text-sm text-muted">Your theme is saved to this browser and to your account, so it follows you to other devices.</p>
        <ThemePicker />
      </SectionCard>

      <SectionCard title="Password" icon={<KeyRound className="h-4 w-4 text-accent" />}>
        <form onSubmit={changePassword} className="space-y-3">
          <PasswordField label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {pwMsg && <Alert tone={pwMsg.tone}>{pwMsg.text}</Alert>}
          <button className="btn-primary">Update password</button>
        </form>
      </SectionCard>

      {profile?.role === 'student' && (
        <SectionCard title="Teacher access" icon={<ShieldCheck className="h-4 w-4 text-accent" />}>
          <p className="mb-3 text-sm text-muted">If your institution invited this email address as a teacher, enter the invitation code to upgrade this account.</p>
          <form onSubmit={redeem} className="space-y-3">
            <Field label="Invitation code" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" placeholder="MAC-…" />
            {codeMsg && <Alert tone={codeMsg.tone}>{codeMsg.text}</Alert>}
            <button className="btn-secondary">Redeem invitation</button>
          </form>
        </SectionCard>
      )}
    </div>
  );
}
