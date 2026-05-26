'use strict';

const { createApp } = require('../../app');

// Extract pure helpers without starting any DB / server
const { _helpers } = createApp({ dbPath: ':memory:', disableTimers: true, disableNotify: true });
const { normalizeOrderItems, sumOrderItemsTotal, getCategorySql, getCategoryLabel } = _helpers;

// ---- normalizeOrderItems ----
describe('normalizeOrderItems', () => {
  test('clamps negative price to 0', () => {
    const result = normalizeOrderItems([{ id: '1', name: 'A', price: -5, quantity: 2 }]);
    expect(result[0].price).toBe(0);
  });

  test('clamps quantity below 1 to 1', () => {
    const result = normalizeOrderItems([{ id: '1', name: 'A', price: 10, quantity: 0 }]);
    expect(result[0].quantity).toBe(1);
  });

  test('preserves valid price and quantity', () => {
    const result = normalizeOrderItems([{ id: '1', name: 'A', price: 50, quantity: 3 }]);
    expect(result[0].price).toBe(50);
    expect(result[0].quantity).toBe(3);
  });

  test('converts string price/quantity to numbers', () => {
    const result = normalizeOrderItems([{ id: '1', name: 'A', price: '80', quantity: '2' }]);
    expect(result[0].price).toBe(80);
    expect(result[0].quantity).toBe(2);
  });

  test('defaults options to empty array if not array', () => {
    const result = normalizeOrderItems([{ id: '1', name: 'A', price: 10, quantity: 1, options: null }]);
    expect(result[0].options).toEqual([]);
  });

  test('preserves options array', () => {
    const result = normalizeOrderItems([{ id: '1', name: 'A', price: 10, quantity: 1, options: ['加辣'] }]);
    expect(result[0].options).toEqual(['加辣']);
  });

  test('defaults variant, category, note to empty string', () => {
    const result = normalizeOrderItems([{ id: '1', name: 'A', price: 10, quantity: 1 }]);
    expect(result[0].variant).toBe('');
    expect(result[0].category).toBe('');
    expect(result[0].note).toBe('');
  });
});

// ---- sumOrderItemsTotal ----
describe('sumOrderItemsTotal', () => {
  test('returns 0 for empty array', () => {
    expect(sumOrderItemsTotal([])).toBe(0);
  });

  test('returns 0 for non-array input', () => {
    expect(sumOrderItemsTotal(null)).toBe(0);
    expect(sumOrderItemsTotal(undefined)).toBe(0);
  });

  test('calculates total correctly', () => {
    const items = [
      { price: 100, quantity: 2 },
      { price: 50, quantity: 3 }
    ];
    expect(sumOrderItemsTotal(items)).toBe(350);
  });

  test('defaults quantity to 1 when missing', () => {
    const items = [{ price: 80 }];
    expect(sumOrderItemsTotal(items)).toBe(80);
  });

  test('handles string price', () => {
    const items = [{ price: '60', quantity: 2 }];
    expect(sumOrderItemsTotal(items)).toBe(120);
  });
});

// ---- getCategorySql ----
describe('getCategorySql', () => {
  test('1-2 returns correct SQL fragment', () => {
    expect(getCategorySql('1-2')).toBe('partySize <= 2');
  });

  test('3-4 returns correct SQL fragment', () => {
    expect(getCategorySql('3-4')).toBe('partySize BETWEEN 3 AND 4');
  });

  test('5-6 returns correct SQL fragment', () => {
    expect(getCategorySql('5-6')).toBe('partySize BETWEEN 5 AND 6');
  });

  test('7+ returns correct SQL fragment', () => {
    expect(getCategorySql('7+')).toBe('partySize >= 7');
  });

  test('unknown category returns null', () => {
    expect(getCategorySql('unknown')).toBeNull();
    expect(getCategorySql('')).toBeNull();
    expect(getCategorySql(undefined)).toBeNull();
  });
});

// ---- getCategoryLabel ----
describe('getCategoryLabel', () => {
  test('known categories return correct label', () => {
    expect(getCategoryLabel('1-2')).toBe('1-2位');
    expect(getCategoryLabel('3-4')).toBe('3-4位');
    expect(getCategoryLabel('5-6')).toBe('5-6位');
    expect(getCategoryLabel('7+')).toBe('7位以上');
  });

  test('unknown category returns fallback label', () => {
    expect(getCategoryLabel('x')).toBe('未知類別');
  });
});
