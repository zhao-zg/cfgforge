import { describe, it, expect } from 'vitest';
import { XorCipher } from '../XorCipher';

describe('XorCipher', () => {
  it('encrypts and decrypts symmetrically', () => {
    const cipher = new XorCipher('secret');
    const data = Buffer.from('Hello, World!', 'utf8');

    const encrypted = cipher.process(data);
    // Encrypted should be different from original
    expect(Buffer.from(encrypted).equals(data)).toBe(false);

    // Decrypt with a fresh cipher (same key, reset index)
    const decipher = new XorCipher('secret');
    const decrypted = decipher.process(encrypted);
    expect(Buffer.from(decrypted).equals(data)).toBe(true);
  });

  it('handles empty cipher key throws', () => {
    expect(() => new XorCipher('')).toThrow();
    expect(() => new XorCipher(null as any)).toThrow();
  });

  it('cipher key longer than data', () => {
    const cipher1 = new XorCipher('verylongkey');
    const cipher2 = new XorCipher('verylongkey');
    const data = Buffer.from('hi', 'utf8');

    const encrypted = cipher1.process(data);
    const decrypted = cipher2.process(encrypted);
    expect(Buffer.from(decrypted).equals(data)).toBe(true);
  });

  it('cipher key shorter than data wraps around', () => {
    const key = 'ab';
    const cipher1 = new XorCipher(key);
    const cipher2 = new XorCipher(key);
    const data = Buffer.from('this is a longer message', 'utf8');

    const encrypted = cipher1.process(data);
    const decrypted = cipher2.process(encrypted);
    expect(Buffer.from(decrypted).equals(data)).toBe(true);
  });

  it('different keys produce different output', () => {
    const data = Buffer.from('same data', 'utf8');
    const cipher1 = new XorCipher('key1');
    const cipher2 = new XorCipher('key2');

    const enc1 = cipher1.process(data);
    const enc2 = cipher2.process(Buffer.from('same data', 'utf8'));
    expect(Buffer.from(enc1).equals(Buffer.from(enc2))).toBe(false);
  });
});
