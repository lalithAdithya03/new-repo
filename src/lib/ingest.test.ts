import { parseMarkedText, splitLong } from './ingest';

describe('parseMarkedText', () => {
  it('reads topics and page / slide / timestamp markers', () => {
    const chunks = parseMarkedText(`## Gradient Descent > Linear Regression
[p.20] Gradient descent minimizes a loss function by moving against the gradient.
[slide 7] Stochastic gradient descent uses a small random minibatch of samples.
## Neural Networks
[00:04:10] The ReLU activation outputs zero for negative inputs and the input otherwise.`);
    expect(chunks.map((c) => [c.topic_name, c.location_kind, c.location_label])).toEqual([
      ['Gradient Descent', 'page', 'p.20'],
      ['Gradient Descent', 'slide', 'slide 7'],
      ['Neural Networks', 'timestamp', '00:04:10'],
    ]);
    expect(chunks[0].page_number).toBe(20);
    expect(chunks[2].seconds).toBe(250);
  });

  it('turns VTT cues into timestamped chunks', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Welcome to the lecture on logistic regression and classification.

00:00:05.000 --> 00:00:09.000
The sigmoid function squashes a linear score into a probability.`;
    const chunks = parseMarkedText(vtt, 'Logistic Regression');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].location_label).toBe('00:00:01');
    expect(chunks[0].content).toContain('sigmoid');
  });

  it('falls back to numbered sections for plain notes', () => {
    const chunks = parseMarkedText('Plain notes without any markers but long enough to keep as a chunk.');
    expect(chunks[0]).toMatchObject({ location_kind: 'section', location_label: '§1', topic_name: 'General' });
  });
});

describe('splitLong', () => {
  it('keeps chunks under the limit on sentence boundaries', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const parts = splitLong(text, 200);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join(' ')).toBe(text);
  });
});
