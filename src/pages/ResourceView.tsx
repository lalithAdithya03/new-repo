import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bot, ExternalLink, FileDown, Lock, MapPin } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { MATERIALS_BUCKET, supabase } from '@/lib/supabase';
import { recordActivity } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import { bytes } from '@/lib/format';
import { RESOURCE_TYPES, type Course, type Resource, type ResourceChunk } from '@/lib/types';
import { DifficultyBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { FullPageSpinner } from '@/components/ui/Spinner';

/** A resource's details and extracted text, with the cited location highlighted (?chunk=… or ?loc=…). */
export default function ResourceView() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const chunkParam = params.get('chunk');
  const locParam = params.get('loc');
  const { profile } = useAuth();
  const [fileError, setFileError] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    const resource = must(await supabase.from('resources').select('*').eq('id', id!).maybeSingle()) as Resource | null;
    if (!resource) return null;
    const [chunks, course] = await Promise.all([
      supabase.from('resource_chunks').select('*').eq('resource_id', id!).order('position').then(must) as Promise<ResourceChunk[]>,
      supabase.from('courses').select('id, title').eq('id', resource.course_id).maybeSingle().then((r) => r.data as Pick<Course, 'id' | 'title'> | null),
    ]);
    return { resource, chunks, course };
  }, [id]);

  const target = data?.chunks.find((c) => c.id === chunkParam) ?? data?.chunks.find((c) => locParam && c.location_label === locParam);

  useEffect(() => {
    if (target) setTimeout(() => document.getElementById(`chunk-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }, [target]);

  useEffect(() => {
    if (data?.resource && profile?.role === 'student') recordActivity('opened_resource', `Opened ${data.resource.title}`, `/resources/${data.resource.id}`);
  }, [data?.resource, profile?.role]);

  if (loading) return <FullPageSpinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState icon={Lock} title="Resource not available">It doesn't exist or you don't have access. Enrol in its course to open it.</EmptyState>;
  const { resource, chunks, course } = data;

  // Opens the stored file through a short-lived signed URL, jumping to the cited page / timestamp when possible.
  const openFile = async (chunk?: ResourceChunk) => {
    setFileError(null);
    if (!resource.storage_path) return;
    const { data: signed, error: e } = await supabase.storage.from(MATERIALS_BUCKET).createSignedUrl(resource.storage_path, 300);
    if (e || !signed) { setFileError(e?.message ?? 'Could not open the file.'); return; }
    let url = signed.signedUrl;
    if (chunk?.page_number && /pdf/i.test(resource.mime_type ?? resource.storage_path)) url += `#page=${chunk.page_number}`;
    if (chunk?.seconds != null && /video|audio/i.test(resource.mime_type ?? '')) url += `#t=${chunk.seconds}`;
    window.open(url, '_blank', 'noopener');
  };
  const externalAt = (chunk?: ResourceChunk) => {
    if (!resource.external_url) return null;
    if (chunk?.seconds != null && /youtu\.?be/.test(resource.external_url)) {
      const u = new URL(resource.external_url); u.searchParams.set('t', `${chunk.seconds}s`); return u.toString();
    }
    return resource.external_url;
  };

  return (
    <div className="space-y-6">
      {course && <Link to={`/courses/${course.id}`} className="btn-ghost -ml-3 w-fit"><ArrowLeft className="h-4 w-4" /> {course.title}</Link>}
      <div className="card card-pad">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">{RESOURCE_TYPES.find((t) => t.value === resource.resource_type)?.label}</span>
          <span className="chip">{resource.subject}</span>
          <DifficultyBadge value={resource.difficulty} />
          {resource.page_count && <span className="chip">{resource.page_count} pages</span>}
          {resource.size_bytes && <span className="chip">{bytes(resource.size_bytes)}</span>}
        </div>
        <h1 className="mt-3 text-2xl font-bold">{resource.title}</h1>
        {resource.description && <p className="mt-1 text-muted">{resource.description}</p>}
        {resource.keywords.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{resource.keywords.map((k) => <span key={k} className="chip">#{k}</span>)}</div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {resource.storage_path && <button className="btn-primary" onClick={() => openFile(target)}><FileDown className="h-4 w-4" /> Open file{target?.page_number && target.location_kind === 'page' ? ` at page ${target.page_number}` : ''}</button>}
          {resource.external_url && <a className="btn-secondary" href={externalAt(target)!} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open link</a>}
          {profile?.role === 'student' && <Link className="btn-secondary" to={`/student/tutor?course=${resource.course_id}&resource=${resource.id}`}><Bot className="h-4 w-4" /> Ask the tutor about this</Link>}
        </div>
        {fileError && <p className="mt-2 text-sm text-danger">{fileError}</p>}
      </div>

      <section>
        <h2 className="mb-3 font-bold">Content{chunks.length ? ` · ${chunks.length} sections` : ''}</h2>
        {chunks.length ? (
          <div className="space-y-3">
            {chunks.map((c) => (
              <article key={c.id} id={`chunk-${c.id}`} className={`card p-4 transition ${target?.id === c.id ? 'border-accent ring-2 ring-accent/40' : ''}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="chip border-accent/40 text-accent"><MapPin className="h-3 w-3" /> {c.location_label}</span>
                  <span>{c.topic_name}</span>
                  {target?.id === c.id && <span className="font-semibold text-accent">Cited passage</span>}
                  {resource.storage_path && c.page_number && <button className="link ml-auto" onClick={() => openFile(c)}>Open at this {c.location_kind === 'slide' ? 'slide' : 'page'}</button>}
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed">{c.content}</p>
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No text has been extracted from this resource, so the tutor can't cite it yet. Open the file above to read it.</p>}
      </section>
    </div>
  );
}
