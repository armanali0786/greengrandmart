import { describe, expect, it } from 'vitest';
import { toPaise, toRupeeDisplay } from '@/lib/money';

describe('toPaise', () => {
  it('converts rupees to integer paise', () => {
    expect(toPaise(199)).toBe(19900);
  });

  it('rounds fractional paise instead of truncating', () => {
    expect(toPaise(19.999)).toBe(2000);
  });
});

describe('toRupeeDisplay', () => {
  it('formats paise as ₹ with Indian digit grouping', () => {
    expect(toRupeeDisplay(10000000)).toBe('₹1,00,000.00');
  });

  it('always shows two decimal places', () => {
    expect(toRupeeDisplay(19900)).toBe('₹199.00');
  });
});
