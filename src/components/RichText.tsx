import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Citation } from '@/lib/types';

/** Minimal, safe markdown: paragraphs, bullet lists, **bold**, `code` and [n] citation links. No HTML injection. */
export function RichText({ text, citations = [] }: { text: string; citations?: Citation[] }) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  const inline = (s: string, key: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g).map((part, i) => {
      const k = `${key}-${i}`;
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={k}>{part.slice(2, -2)}</strong>;
      if (/^`[^`]+`$/.test(part)) return <code key={k} className="rounded bg-surface px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
      const m = part.match(/^\[(\d+)\]$/);
      if (m) {
        const c = byN.get(+m[1]);
        return c ? (
          <Link key={k} to={`/resources/${c.resource_id}?chunk=${c.chunk_id}`} className="mx-0.5 align-super text-[0.7em] font-bold text-accent hover:underline"
            title={`${c.resource_title} · ${c.location_label}`}>[{m[1]}]</Link>
        ) : <Fragment key={k}>{part}</Fragment>;
      }
      return <Fragment key={k}>{part}</Fragment>;
    });

  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${i}-${j}`)}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ''), `${i}-${j}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}
