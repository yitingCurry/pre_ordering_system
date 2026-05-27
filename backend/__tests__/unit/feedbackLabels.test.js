'use strict';

const { labelRating, labelDim, RATING_LABELS, DIM_LABELS } = require('../../line/feedbackLabels');

describe('labelRating', () => {
  test('returns correct label for known ratings', () => {
    expect(labelRating('good')).toBe('滿意');
    expect(labelRating('ok')).toBe('普通');
    expect(labelRating('bad')).toBe('不滿意');
  });

  test('returns dash for null/undefined', () => {
    expect(labelRating(null)).toBe('—');
    expect(labelRating(undefined)).toBe('—');
    expect(labelRating('')).toBe('—');
  });

  test('returns raw value for unknown rating key', () => {
    expect(labelRating('excellent')).toBe('excellent');
  });
});

describe('labelDim', () => {
  test('returns correct label for known dimensions', () => {
    expect(labelDim('overall')).toBe('整體');
    expect(labelDim('wait')).toBe('等候');
    expect(labelDim('food')).toBe('餐點');
    expect(labelDim('service')).toBe('服務');
  });

  test('returns raw value for unknown dimension', () => {
    expect(labelDim('unknown')).toBe('unknown');
  });
});

describe('RATING_LABELS / DIM_LABELS constants', () => {
  test('RATING_LABELS has three keys', () => {
    expect(Object.keys(RATING_LABELS)).toEqual(['good', 'ok', 'bad']);
  });

  test('DIM_LABELS has four keys', () => {
    expect(Object.keys(DIM_LABELS)).toEqual(['overall', 'wait', 'food', 'service']);
  });
});
