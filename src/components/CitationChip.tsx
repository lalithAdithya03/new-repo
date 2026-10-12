import { Link } from 'react-router-dom';
import { BookOpen, Presentation, Video, FileText } from 'lucide-react';
import type { Citation } from '@/lib/types';

const ICON = { page: BookOpen, slide: Presentation, timestamp: Video, section: FileText };

export function CitationChip({ c }: { c: Citation }) {
  const Icon = ICON[c.location_kind] ?? FileText;
  const where = c.location_kind === 'page' ? `Page ${c.location_label.replace('p.', '')}`
    : c.location_kind === 'slide' ? c.location_label.replace('slide', 'Slide')
    : c.location_kind === 'timestamp' ? `▶ ${c.location_label}` : c.location_label;
  return (
    <Link to={`/resources/${c.resource_id}?chunk=${c.chunk_id}`} title={c.excerpt}
      className="chip max-w-full gap-1.5 border-accent/40 py-1 text-text hover:bg-primary/15" data-testid="citation">
      <span className="font-bold text-accent">[{c.n}]</span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="truncate">{c.resource_title} · {where}</span>
    </Link>
  );
}
