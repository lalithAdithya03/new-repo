import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';

interface Props {
  initial?: string;
  /** Called on submit; defaults to navigating to /search?q=… */
  onSearch?: (q: string) => void;
  placeholder?: string;
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  className?: string;
}

export function SearchBar({ initial = '', onSearch, placeholder = 'Search courses, topics, notes, slides, quizzes…', size = 'md', autoFocus, className = '' }: Props) {
  const [q, setQ] = useState(initial);
  const navigate = useNavigate();
  useEffect(() => setQ(initial), [initial]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (onSearch) onSearch(term);
    else navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const lg = size === 'lg';
  return (
    <form role="search" onSubmit={submit} className={`relative w-full ${className}`}>
      <label htmlFor={`search-${size}`} className="sr-only">Search</label>
      <Search className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted ${lg ? 'h-5 w-5' : 'h-4 w-4'}`} aria-hidden />
      <input
        id={`search-${size}`}
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className={`input pr-24 [&::-webkit-search-cancel-button]:hidden ${lg ? 'h-14 rounded-2xl pl-11 text-base' : 'pl-10'}`}
        enterKeyHint="search"
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {q && (
          <button type="button" onClick={() => setQ('')} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        )}
        <button type="submit" className={`btn-primary ${lg ? 'px-4 py-2' : 'px-3 py-1.5 text-xs'}`}>Search</button>
      </div>
    </form>
  );
}
