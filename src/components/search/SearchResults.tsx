import { Link } from 'react-router-dom';
import { BookOpen, FileText, GraduationCap, Hash, ListChecks, Presentation, Quote, StickyNote, Video, Link2 } from 'lucide-react';
import type { SearchResult } from '@/lib/types';
import { KIND_LABEL } from '@/lib/search';
import { DifficultyBadge } from '@/components/ui/Badge';

const KIND_ICON: Record<string, typeof BookOpen> = {
  course: GraduationCap, topic: Hash, quiz: ListChecks, passage: Quote, textbook: BookOpen, pdf: FileText,
  slides: Presentation, notes: StickyNote, video: Video, link: Link2, other: FileText,
};

/** Renders «highlight» markers from ts_headline as <mark> without using innerHTML. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return <>{parts.map((p, i) => (p.startsWith('«') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</>;
}

export function SearchResultCard({ r }: { r: SearchResult }) {
  const Icon = KIND_ICON[r.kind] ?? FileText;
  return (
    <Link to={r.link} className="card group flex gap-4 p-4 transition hover:-translate-y-0.5 hover:border-accent/60" data-testid="search-result">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-accent"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">{KIND_LABEL[r.kind] ?? r.kind}</span>
          <span className="chip">{r.subject}</span>
          <DifficultyBadge value={r.difficulty} />
        </div>
        <p className="mt-1.5 font-semibold group-hover:text-accent">{r.title}</p>
        {r.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted"><Highlighted text={r.description} /></p>}
        <p className="mt-1.5 text-xs text-muted">
          Source: <span className="text-text/80">{r.kind === 'course' ? r.source : r.course_title}</span>
          {r.location && <> · <span className="text-text/80">{r.location}</span></>}
        </p>
      </div>
    </Link>
  );
}
