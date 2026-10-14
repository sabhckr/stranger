import { describe, expect, it } from 'vitest';
import { routeFor } from './router.js';

describe('routeFor', () => {
  it('maps paths to routes', () => {
    expect(routeFor('/')).toBe('home');
    expect(routeFor('/chat/')).toBe('chat');
    expect(routeFor('/admin')).toBe('admin');
    expect(routeFor('/terms')).toBe('terms');
    expect(routeFor('/nope')).toBe('not-found');
  });
});
