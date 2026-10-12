import { useState, type FormEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { MATERIALS_BUCKET, supabase } from '@/lib/supabase';
import { recordActivity } from '@/lib/api';
import { extractPdfChunks, isPdf, isTextLike, parseMarkedText, type ChunkDraft } from '@/lib/ingest';
import { DIFFICULTIES, RESOURCE_TYPES, type Difficulty, type ResourceType, type Topic } from '@/lib/types';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = '.pdf,.pptx,.ppt,.docx,.txt,.md,.vtt,.srt,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mp3';

function guessType(file: File): ResourceType {
  if (isPdf(file)) return 'pdf';
  if (/\.(pptx?|key)$/i.test(file.name)) return 'slides';
  if (/\.(vtt|srt|mp4|webm|mp3)$/i.test(file.name)) return 'video';
  return 'notes';
}

/**
 * Upload flow: create the resource row → upload the file to the private bucket under <course_id>/ →
 * extract text into citeable chunks (PDF pages, or marked-up text) → insert chunks.
 */
export function UploadResource({ courseId, subject, topics, teacherId, onDone }: {
  courseId: string; subject: string; topics: Topic[]; teacherId: string; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', resource_type: 'notes' as ResourceType, topic_id: '', difficulty: 'medium' as Difficulty,
    keywords: '', external_url: '', text: '', is_published: true,
  });
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    setFile(f); setError(null);
    if (f) {
      if (f.size > MAX_BYTES) { setError('Files must be 50 MB or smaller.'); setFile(null); return; }
      setForm((s) => ({ ...s, title: s.title || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), resource_type: guessType(f) }));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setDone(null);
    if (!form.title.trim()) { setError('Add a title.'); return; }
    if (!file && !form.text.trim() && !form.external_url.trim()) { setError('Choose a file, paste text, or add a link.'); return; }
    if (form.external_url && !/^https?:\/\//i.test(form.external_url)) { setError('Links must start with http:// or https://'); return; }

    const topicName = topics.find((t) => t.id === form.topic_id)?.name ?? 'General';
    let resourceId: string | null = null;
    try {
      setProgress('Creating resource…');
      const { data: res, error: insErr } = await supabase.from('resources').insert({
        course_id: courseId, owner_id: teacherId, topic_id: form.topic_id || null, title: form.title.trim(), description: form.description.trim(),
        resource_type: form.resource_type, subject, difficulty: form.difficulty,
        keywords: form.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean),
        external_url: form.external_url.trim() || null, is_published: form.is_published,
        mime_type: file?.type || null, size_bytes: file?.size ?? null,
      }).select().single();
      if (insErr) throw insErr;
      resourceId = res.id;

      let chunks: ChunkDraft[] = [];
      let pageCount: number | null = null;
      if (file) {
        setProgress('Uploading file…');
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
        const path = `${courseId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from(MATERIALS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) throw upErr;
        await supabase.from('resources').update({ storage_path: path }).eq('id', res.id);

        if (isPdf(file)) {
          setProgress('Extracting text from PDF…');
          const out = await extractPdfChunks(file, topicName, (p, n) => setProgress(`Extracting text: page ${p} of ${n}`));
          chunks = out.chunks; pageCount = out.pageCount;
        } else if (isTextLike(file)) {
          chunks = parseMarkedText(await file.text(), topicName);
        }
      }
      if (form.text.trim()) chunks = chunks.concat(parseMarkedText(form.text, topicName));

      if (chunks.length) {
        setProgress(`Indexing ${chunks.length} sections…`);
        for (let i = 0; i < chunks.length; i += 200) {
          const batch = chunks.slice(i, i + 200).map((c, j) => ({ ...c, resource_id: res.id, course_id: courseId, position: i + j + 1 }));
          const { error: chErr } = await supabase.from('resource_chunks').insert(batch);
          if (chErr) throw chErr;
        }
      }
      if (pageCount) await supabase.from('resources').update({ page_count: pageCount }).eq('id', res.id);
      recordActivity('uploaded', `Uploaded ${form.title.trim()}`, `/resources/${res.id}`);

      setDone(chunks.length
        ? `Added “${form.title.trim()}” with ${chunks.length} searchable sections.`
        : `Added “${form.title.trim()}”. No text could be extracted from this format, so search and the tutor only see its title, description and keywords. Paste its notes or transcript to make it citeable.`);
      setFile(null);
      setForm((s) => ({ ...s, title: '', description: '', keywords: '', external_url: '', text: '' }));
      onDone();
    } catch (err) {
      // Roll back a half-created resource so it doesn't linger without its file.
      if (resourceId) await supabase.from('resources').delete().eq('id', resourceId);
      setError((err as Error).message || 'Upload failed.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${file ? 'border-accent bg-primary/10' : 'border-border hover:border-accent/60'}`}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0] ?? null); }}>
        <UploadCloud className="mb-2 h-8 w-8 text-accent" />
        <span className="text-sm font-semibold">{file ? file.name : 'Drop a file here or click to choose'}</span>
        <span className="mt-1 text-xs text-muted">PDF, slides, Word, text/Markdown, VTT/SRT transcripts, images, video · up to 50 MB</span>
        <input type="file" className="sr-only" accept={ACCEPT} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <div><label className="label" htmlFor="ur-type">Type</label>
          <select id="ur-type" className="input" value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value as ResourceType })}>
            {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select></div>
        <div><label className="label" htmlFor="ur-topic">Topic</label>
          <select id="ur-topic" className="input" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
            <option value="">General / multiple topics</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="ur-diff">Difficulty</label>
          <select id="ur-diff" className="input capitalize" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select></div>
        <Field label="Keywords" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="comma, separated" />
        <Field label="Link (optional)" value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://… e.g. a lecture video" />
      </div>
      <div><label className="label" htmlFor="ur-desc">Description</label>
        <input id="ur-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div>
        <label className="label" htmlFor="ur-text">Text, notes or transcript (optional)</label>
        <textarea id="ur-text" className="input min-h-32 font-mono text-xs" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })}
          placeholder={'## Gradient Descent > Linear Regression\n[p.20] Gradient descent minimizes a loss…\n[slide 7] Stochastic gradient descent…\n[00:12:45] In the lecture video…'} />
        <p className="mt-1 text-xs text-muted">Use <code>## Topic</code> headings and <code>[p.12]</code>, <code>[slide 4]</code> or <code>[00:12:30]</code> markers so the tutor can cite exact locations. PDFs are extracted page by page automatically.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
        Visible to enrolled students
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      <button className="btn-primary" disabled={!!progress}>{progress ? <Spinner label={progress} /> : 'Add material'}</button>
    </form>
  );
}
