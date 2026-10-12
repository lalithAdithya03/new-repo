import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bot, BookX, Info, MessageSquarePlus, Send, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { askTutor, type Level } from '@/lib/tutor';
import { getEnrolledCourses, recordActivity } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import { timeAgo } from '@/lib/format';
import type { Resource, TutorConversation, TutorMessage } from '@/lib/types';
import { RichText } from '@/components/RichText';
import { CitationChip } from '@/components/CitationChip';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

const SUGGESTIONS = ['Explain the main idea of this topic', 'What is gradient descent?', 'Give me an example of overfitting'];

function MessageBubble({ m, demoReason }: { m: TutorMessage; demoReason?: string }) {
  if (m.role === 'user') {
    return <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-fg">{m.content}</div>;
  }
  const tone = m.grounding === 'not_covered' ? 'border-danger/40' : m.grounding === 'partial' ? 'border-warning/50' : 'border-border';
  return (
    <div className={`max-w-[92%] rounded-2xl rounded-bl-sm border bg-surface-2 px-4 py-3 text-sm ${tone}`} data-testid="tutor-answer">
      {m.grounding === 'not_covered' && (
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-danger"><BookX className="h-4 w-4" /> Not covered by your material</p>
      )}
      {m.grounding === 'partial' && (
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-warning"><AlertTriangle className="h-4 w-4" /> Partially covered by your material</p>
      )}
      {m.grounding === 'demo' && (
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-accent"><Info className="h-4 w-4" /> Demo mode · quoted from your sources</p>
      )}
      {m.grounding === 'grounded' && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-success"><Sparkles className="h-3.5 w-3.5" /> AI explanation · source-backed</p>
      )}
      <RichText text={m.content} citations={m.citations} />
      {m.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">{m.citations.map((c) => <CitationChip key={`${c.n}-${c.chunk_id}`} c={c} />)}</div>
      )}
      {demoReason && <p className="mt-2 text-xs text-muted">{demoReason}</p>}
    </div>
  );
}

export default function TutorPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [resourceId, setResourceId] = useState(params.get('resource') ?? '');
  const [level, setLevel] = useState<Level>('intermediate');
  const [conversationId, setConversationId] = useState<string | null>(params.get('c'));
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [demoNotes, setDemoNotes] = useState<Record<string, string>>({});
  const [input, setInput] = useState(params.get('q') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const courses = useAsync(() => getEnrolledCourses(profile!.id), [profile?.id]);
  const resources = useAsync(async () => courseId
    ? must(await supabase.from('resources').select('id, title, resource_type').eq('course_id', courseId).order('title')) as Pick<Resource, 'id' | 'title' | 'resource_type'>[]
    : [], [courseId]);
  const conversations = useAsync(async () => must(await supabase.from('tutor_conversations').select('*').order('updated_at', { ascending: false }).limit(30)) as TutorConversation[], [profile?.id]);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    supabase.from('tutor_messages').select('*').eq('conversation_id', conversationId).order('created_at').then(({ data, error: e }) => {
      if (e) setError(e.message); else setMessages((data ?? []) as TutorMessage[]);
    });
    const conv = conversations.data?.find((c) => c.id === conversationId);
    if (conv) { setCourseId(conv.course_id ?? ''); setResourceId(conv.resource_id ?? ''); }
  }, [conversationId, conversations.data]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const newChat = () => { setConversationId(null); setMessages([]); setParams({}); setError(null); };

  const deleteConversation = async (id: string) => {
    await supabase.from('tutor_conversations').delete().eq('id', id);
    if (id === conversationId) newChat();
    conversations.reload();
  };

  const send = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault();
    const question = (preset ?? input).trim();
    if (!question || busy || !profile) return;
    setInput('');
    setError(null);
    setBusy(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const conv = must(await supabase.from('tutor_conversations').insert({
          student_id: profile.id, course_id: courseId || null, resource_id: resourceId || null, title: question.slice(0, 80),
        }).select().single()) as TutorConversation;
        convId = conv.id;
        setConversationId(conv.id);
        setParams({ c: conv.id });
      }
      const userMsg = must(await supabase.from('tutor_messages').insert({
        conversation_id: convId, student_id: profile.id, role: 'user', content: question,
      }).select().single()) as TutorMessage;
      setMessages((m) => [...m, userMsg]);

      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      const answer = await askTutor({ question, level, courseId, resourceId, history });
      const content = answer.closestTopics?.length
        ? `${answer.content}\n\nYour material does cover: **${answer.closestTopics.join(', ')}**.`
        : answer.content;
      const botMsg = must(await supabase.from('tutor_messages').insert({
        conversation_id: convId, student_id: profile.id, role: 'assistant', content, grounding: answer.grounding, citations: answer.citations,
      }).select().single()) as TutorMessage;
      if (answer.demoReason) setDemoNotes((d) => ({ ...d, [botMsg.id]: answer.demoReason! }));
      setMessages((m) => [...m, botMsg]);
      await supabase.from('tutor_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
      recordActivity('tutor_question', `Asked the tutor: ${question.slice(0, 80)}`, `/student/tutor?c=${convId}`);
      conversations.reload();
    } catch (err) {
      setError((err as Error).message || 'The tutor could not answer right now.');
    } finally {
      setBusy(false);
    }
  };

  const noCourses = courses.data && courses.data.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <button className="btn-primary w-full" onClick={newChat}><MessageSquarePlus className="h-4 w-4" /> New conversation</button>
        <div className="card p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">History</p>
          {conversations.loading ? <Spinner /> : conversations.data?.length ? (
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
              {conversations.data.map((c) => (
                <li key={c.id} className="group flex items-center">
                  <button onClick={() => { setConversationId(c.id); setParams({ c: c.id }); }}
                    className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm ${c.id === conversationId ? 'bg-primary/15 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'}`}>
                    <span className="block truncate">{c.title}</span>
                    <span className="block text-[11px] opacity-70">{timeAgo(c.updated_at)}</span>
                  </button>
                  <button onClick={() => deleteConversation(c.id)} className="rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label="Delete conversation">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-1 text-sm text-muted">No conversations yet.</p>}
        </div>
      </aside>

      <section className="card flex min-h-[70vh] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <Bot className="h-5 w-5 text-accent" />
          <h1 className="mr-auto text-lg font-bold">AI Tutor</h1>
          <select className="input w-auto py-2" aria-label="Course" value={courseId} disabled={!!messages.length}
            onChange={(e) => { setCourseId(e.target.value); setResourceId(''); }}>
            <option value="">All my courses</option>
            {courses.data?.map((c) => <option key={c.course.id} value={c.course.id}>{c.course.title}</option>)}
          </select>
          <select className="input w-auto py-2" aria-label="Source material" value={resourceId} disabled={!courseId || !!messages.length}
            onChange={(e) => setResourceId(e.target.value)}>
            <option value="">All materials</option>
            {resources.data?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <select className="input w-auto py-2" aria-label="Explanation level" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {courses.error && <ErrorState message={courses.error} onRetry={courses.reload} />}
          {noCourses ? (
            <EmptyState icon={Bot} title="Enrol in a course to use the tutor" action={<Link to="/student/courses" className="btn-primary">Browse courses</Link>}>
              The tutor answers from your course materials, so it needs at least one course.
            </EmptyState>
          ) : messages.length === 0 && !busy ? (
            <div className="mx-auto max-w-lg py-8 text-center">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-accent"><Bot className="h-7 w-7" /></span>
              <h2 className="text-xl font-bold">Ask anything about your material</h2>
              <p className="mt-2 text-sm text-muted">Answers come only from your course sources, with citations you can click. If something isn’t in your material, the tutor will say so.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => <button key={s} className="chip cursor-pointer py-1.5 hover:border-accent/60" onClick={() => send(undefined, s)}>{s}</button>)}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} m={m} demoReason={demoNotes[m.id]} />)
          )}
          {busy && <Spinner label="Reading your sources…" />}
          {error && <Alert tone="error">{error}</Alert>}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="border-t border-border p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <label htmlFor="tutor-input" className="sr-only">Your question</label>
            <textarea id="tutor-input" rows={1} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask a question about your course material…" className="input max-h-40 min-h-[44px] resize-y" disabled={busy || !!noCourses} />
            <button type="submit" className="btn-primary h-11 px-4" disabled={busy || !input.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">Enter to send · Shift+Enter for a new line</p>
        </form>
      </section>
    </div>
  );
}
