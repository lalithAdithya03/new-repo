# Roadmap

Ordered by weight in the Track D evaluation criteria and by how much each step unblocks the next.

1. **Multimodal ingestion** (Knowledge Base & Grounding, 20%)
   - PDF text extraction with page numbers; slide decks (PPTX) with slide numbers.
   - Video: speech-to-text with timestamps (e.g. Whisper) producing the same unit format.
   - Figures and diagrams: extract images and caption them with a vision model, then index the captions with their page/slide.
2. **Real retrieval and generation**
   - Embedding-based retrieval, combined with the existing lexical scoring.
   - LLM answers constrained to retrieved excerpts, with citations and the existing refusal threshold, keeping outside knowledge clearly separated.
3. **Better assessment** (15%)
   - LLM-written MCQ / short-answer / numerical questions tagged with topic, source and difficulty.
   - Verify every answer key with a second model or a solver before it enters the pool; add semantic de-duplication.
4. **Framework-based evaluation** (15%)
   - Export the test set and run RAGAS or DeepEval for faithfulness, answer relevancy, context precision and recall.
   - A hand-written test set (questions with known source locations plus off-material queries) in place of the auto-generated one.
5. **Personalization evaluation** (20%)
   - Multi-session simulated students with item-level difficulty; report mastery gain and repetition rate against baselines with variance across seeds.
6. **Optional extras**
   - Hindi / mixed-language support, audio tutoring, revision material (flashcards) for weak topics.
7. **Deliverables**
   - Demo video (3–10 min) covering upload, grounded chat, assessment and architecture.
   - Split the single HTML file into modules with a small backend once ingestion needs one.
