import { assessGrounding, extractiveAnswer, tokenize } from './grounding';
import type { MatchedChunk } from './types';

const chunk = (id: string, topic: string, content: string, label = 'p.1'): MatchedChunk => ({
  id, resource_id: 'r1', resource_title: 'Textbook', resource_type: 'textbook', course_id: 'c1', topic_name: topic,
  location_kind: 'page', location_label: label, page_number: 1, seconds: null, content, rank: 1,
});

const CHUNKS = [
  chunk('a', 'Gradient Descent', 'Gradient descent minimizes a loss function by repeatedly moving the parameters in the direction of the negative gradient. The learning rate controls the size of each step taken downhill.', 'p.20'),
  chunk('b', 'Overfitting', 'Overfitting happens when a model memorizes noise in the training data and performs poorly on validation data.', 'p.27'),
];

describe('grounding engine', () => {
  it('tokenises with stop words removed and light stemming', () => {
    expect(tokenize('What is the learning rate in gradient descent?')).toEqual(['learn', 'rate', 'gradient', 'descent']);
  });

  it('marks a question answered by the material as grounded and ranks the right chunk first', () => {
    const g = assessGrounding('What does the learning rate control in gradient descent?', CHUNKS);
    expect(g.level).toBe('grounded');
    expect(g.ranked[0].chunk.id).toBe('a');
  });

  it('refuses questions that the material does not cover', () => {
    expect(assessGrounding('How do I bake sourdough bread?', CHUNKS).level).toBe('not_covered');
    expect(assessGrounding('anything', []).level).toBe('not_covered');
  });

  it('flags partially covered questions', () => {
    const g = assessGrounding('Overfitting memorizes noise, but what is regularization?', CHUNKS);
    expect(g.level).toBe('partial');
  });

  it('extracts verbatim sentences that overlap the question', () => {
    const g = assessGrounding('What controls the step size? learning rate', CHUNKS);
    const picks = extractiveAnswer('What controls the step size? learning rate', g.ranked);
    expect(picks[0].sentence).toBe('The learning rate controls the size of each step taken downhill.');
    expect(picks[0].chunk.location_label).toBe('p.20');
  });
});
