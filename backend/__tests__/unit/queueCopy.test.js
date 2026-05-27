'use strict';

const {
  SKIP_RULE_SHORT,
  SKIP_RULE_LINE,
  SKIP_RULE_CALLED,
  WAITING_STAY_HINT,
  SKIP_REASON_NOTE
} = require('../../line/queueCopy');

describe('queueCopy constants', () => {
  test('SKIP_RULE_SHORT is a non-empty string', () => {
    expect(typeof SKIP_RULE_SHORT).toBe('string');
    expect(SKIP_RULE_SHORT.length).toBeGreaterThan(0);
  });

  test('SKIP_RULE_LINE equals SKIP_RULE_SHORT (they must stay in sync)', () => {
    expect(SKIP_RULE_LINE).toBe(SKIP_RULE_SHORT);
  });

  test('SKIP_RULE_CALLED is a non-empty string', () => {
    expect(typeof SKIP_RULE_CALLED).toBe('string');
    expect(SKIP_RULE_CALLED.length).toBeGreaterThan(0);
  });

  test('WAITING_STAY_HINT is a non-empty string', () => {
    expect(typeof WAITING_STAY_HINT).toBe('string');
    expect(WAITING_STAY_HINT.length).toBeGreaterThan(0);
  });

  test('SKIP_REASON_NOTE is a non-empty string', () => {
    expect(typeof SKIP_REASON_NOTE).toBe('string');
    expect(SKIP_REASON_NOTE.length).toBeGreaterThan(0);
  });
});
