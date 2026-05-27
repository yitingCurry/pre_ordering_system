'use strict';

const { countWaitingAhead } = require('../../line/queueHelpers');

describe('countWaitingAhead', () => {
  function makeDb(count) {
    return {
      get: jest.fn().mockResolvedValue({ c: count })
    };
  }

  test('returns count from DB result', async () => {
    const db = makeDb(3);
    const result = await countWaitingAhead(db, 10);
    expect(result).toBe(3);
    expect(db.get).toHaveBeenCalledWith(
      expect.stringContaining("status = 'waiting'"),
      [10]
    );
  });

  test('returns 0 when DB returns null row', async () => {
    const db = { get: jest.fn().mockResolvedValue(null) };
    const result = await countWaitingAhead(db, 5);
    expect(result).toBe(0);
  });

  test('returns 0 when DB row has c=0', async () => {
    const db = makeDb(0);
    const result = await countWaitingAhead(db, 1);
    expect(result).toBe(0);
  });
});
