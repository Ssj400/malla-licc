import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeScrollVelocity } from './drag.js';

test('scroll only inside viewport edges, not in the middle or outside', () => {
  for (const y of [-10, 111, 400, 690, 810, NaN]) assert.equal(edgeScrollVelocity(y, 800), 0);
  assert.equal(edgeScrollVelocity(0, 800), -900);
  assert.equal(edgeScrollVelocity(800, 800), 900);
});
test('scroll accelerates smoothly and symmetrically toward the edge', () => {
  assert.ok(edgeScrollVelocity(790, 800) > edgeScrollVelocity(750, 800));
  assert.ok(edgeScrollVelocity(750, 800) > edgeScrollVelocity(700, 800));
  assert.equal(edgeScrollVelocity(15, 800), -edgeScrollVelocity(785, 800));
  assert.equal(edgeScrollVelocity(0, 200), -900);
  assert.equal(edgeScrollVelocity(100, 200), 0);
});
