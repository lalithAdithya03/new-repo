# StudyMate Architecture

StudyMate is currently a single-file, client-side app (`StudyMate – Source-Grounded Adaptive Study Companion.html`). Everything runs in the browser; there is no backend and no LLM.

```
 text sources ──► parse() ──► content units ──► build() ──► TF-IDF index + question candidates
 (.txt .md .vtt     │            {src, loc, topic, text}        │
  .srt)             └─► topics + prerequisites (TP)             │
                    └─► numerical question bank (QB)            ▼
                                              ┌───────────────┼────────────────┐
                                              ▼               ▼                ▼
                                        Tutor (ans)     Assess (gen)     Evaluate (runEval)
                                              │               │
                                              └──► Learner model S (BKT per topic) ──► Dashboard
```

## 1. Knowledge base

`parse(raw, src)` walks each file line by line and produces **content units**:

- `## Topic > A, B` sets the current topic and its prerequisites (`TP[topic] = [A, B]`).
- `[p.N]`, `[slide N]`, `[hh:mm:ss]` set the current location `loc`; `.vtt`/`.srt` cue timestamps do the same (every 4th cue starts a new unit).
- Text accumulates until the next marker, then is flushed as a unit if it is longer than 40 characters.
- `Q: … | A: n` lines go to the numerical question bank `QB`.

Each unit keeps `src` (file name), `loc` and `topic`, so every answer and question can link back to its origin. Source type (video / slide / page) is inferred from the file name for display.

`build()` tokenizes units (lowercase, stop-word removal, light stemming), computes document frequencies and an IDF table, and builds **question candidates** (`CANDS`): sentences of 8+ words with their rarest content word as the blank. Candidates are split into easy/medium/hard thirds by that word's IDF (rarer = harder).

## 2. Grounding method (Tutor)

`search(q)` ranks units with BM25-style scoring (`k1 = 1.2`, `b = 0.75`) and returns the top 3 plus a **coverage** score: the IDF-weighted share of query terms found in the best unit.

`ans(q)` then decides:

| Coverage | Result |
|---|---|
| `< 0.30` | **Refuse**: "Not covered by your material"; shows closest topics, never outside knowledge |
| `0.30 – 0.60` | **Partial**: flagged with a warning, extractive answer only |
| `≥ 0.60` | **Answer**: the 2 best-matching sentences from the top unit, quoted verbatim |

Answers are purely extractive, so they cannot contain unsupported claims. The cost is that they cannot synthesize or paraphrase. Each answer carries citation chips; clicking one opens a modal with the unit text, highlighted, plus its source type, name, location and topic. If a prerequisite topic has mastery below 0.4, the tutor adds a review hint.

## 3. Assessment

`gen(S, scope, n, mode, adaptive)` picks questions from the candidates in the chosen topics:

- **Topic choice**: weighted random, weight `1.1 − mastery`, so weak topics are sampled more.
- **Difficulty**: mastery `< 0.4` → easy, `< 0.7` → medium, otherwise hard.
- **No repeats**: question ids already in `S.asked` are excluded.
- **Types**: MCQ (blank plus 3 distractors, preferring same-topic terms), short answer (stemmed match), numerical (from `QB`, 1% tolerance).
- **Correctness check** (`ok`): the answer must occur in the evidence sentence, and an MCQ needs 3 distinct distractors. This is a self-consistency check, not a second-model validation.

After each answer the learner model updates and the UI shows the evidence sentence with a citation chip. The end-of-quiz report lists per-topic scores and heuristic misconceptions (for an MCQ miss, which other topic's term the student chose).

## 4. Learner model

One **Bayesian knowledge tracing** estimate per topic, `S.m[topic] = {p, n}`:

- Prior `p = 0.30`, slip `0.10`, learn `T = 0.15`.
- Guess `0.25` for MCQ, `0.05` for typed answers.
- Update: posterior of mastery given correct/incorrect, then `p' = q + (1 − q)·T`.
- Reading an answer from the tutor adds a small `+0.02` bump (capped at 0.99).

New students start at the prior for every topic; the *Diagnostic* quiz samples across all topics. State is persisted to `localStorage` under the key `sm1`.

The **study schedule** reviews each topic at an interval of `1 + 8·p²` days (weaker topics come up more often) across the days before the exam, capped at 14 days.

## 5. Evaluation (built in)

`runEval()` builds a test set from the loaded sources: up to 12 sentences with every third word dropped as the query (known source unit), plus 5 off-material questions. It reports:

| Metric | How it is computed |
|---|---|
| Source recall@1 / @3 | Is the known unit ranked first / in the top 3 |
| Context precision@3 | Share of the top 3 from the correct topic |
| Faithfulness | Cited sentences appear verbatim in the unit (high by construction) |
| Answer relevancy | Key-term coverage |
| Correct / false refusal | Off-material refused; in-scope not refused |

Simulated students (starting ability 0.2 / 0.5 / 0.8, 5 sessions × 8 questions) compare the adaptive policy with a random baseline on true mastery gain, estimated mastery and repetition rate.

**Caveat:** these are lightweight proxies, not RAGAS/DeepEval/TruLens. The test set is derived from the same text it is tested on, so recall will look optimistic. The simulated learners are synthetic.

## Known limitations

- Input must be pre-converted text with markers (no PDF, PPTX, video or image parsing).
- Retrieval is lexical only, so no synonyms or semantic matching and English only.
- Question generation is cloze-style only; there are no conceptual or multi-step questions.
- Everything lives in one HTML file and one browser's `localStorage`.
