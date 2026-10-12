import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { recordActivity } from '@/lib/api';
import { DIFFICULTIES, type Course, type Difficulty } from '@/lib/types';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';

export function CourseForm({ teacherId, course, onSaved }: { teacherId: string; course?: Course; onSaved: (c: Course) => void }) {
  const [form, setForm] = useState({
    title: course?.title ?? '', code: course?.code ?? '', subject: course?.subject ?? '', description: course?.description ?? '',
    difficulty: (course?.difficulty ?? 'medium') as Difficulty, is_published: course?.is_published ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 3) { setError('Give the course a title of at least 3 characters.'); return; }
    setBusy(true); setError(null);
    const payload = { ...form, title: form.title.trim(), code: form.code.trim() || null, subject: form.subject.trim() || 'General', description: form.description.trim() };
    const res = course
      ? await supabase.from('courses').update(payload).eq('id', course.id).select().single()
      : await supabase.from('courses').insert({ ...payload, teacher_id: teacherId }).select().single();
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    if (!course) recordActivity('created_course', `Created course ${payload.title}`, `/teacher/courses/${res.data.id}`);
    onSaved(res.data as Course);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Course title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Machine Learning Foundations" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ML101" />
        <Field label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Computer Science" />
        <div><label className="label" htmlFor="cf-diff">Difficulty</label>
          <select id="cf-diff" className="input capitalize" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select></div>
      </div>
      <div><label className="label" htmlFor="cf-desc">Description</label>
        <textarea id="cf-desc" className="input min-h-24" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
        Published (visible in the catalogue so students can enrol)
      </label>
      <button className="btn-primary" disabled={busy}>{busy ? <Spinner label="Saving…" /> : course ? 'Save changes' : 'Create course'}</button>
    </form>
  );
}
