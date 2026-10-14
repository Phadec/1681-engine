import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TargetLock, keptTarget, nearestTarget, pickTarget, type LockBody } from './TargetLock';

const O = { x: 0, y: 0 };

test('a drag picks the body closest to its line, a far one dead ahead over a near one aside', () => {
  const bodies: LockBody[] = [
    { id: 1, x: 40, y: 40 },
    { id: 2, x: 180, y: 0 },
    { id: 3, x: -50, y: 0 },
  ];
  assert.equal(pickTarget(O, { x: 1, y: 0 }, bodies), 2);
  assert.equal(pickTarget(O, { x: -1, y: 0 }, bodies), 3);
  assert.equal(pickTarget(O, { x: 0, y: -1 }, bodies), null);
  assert.equal(pickTarget(O, { x: 0, y: 0 }, bodies), null);
  // of two on one line the nearer wins
  assert.equal(pickTarget(O, { x: 1, y: 0 }, [{ id: 7, x: 150, y: 0 }, { id: 8, x: 60, y: 0 }]), 8);
});

test('nearest and kept', () => {
  const bodies: LockBody[] = [
    { id: 5, x: 30, y: 0 },
    { id: 4, x: 0, y: 30 },
    { id: 9, x: 400, y: 0 },
  ];
  assert.equal(nearestTarget(O, bodies), 4);
  assert.equal(nearestTarget(O, [{ id: 9, x: 400, y: 0 }]), null);
  assert.equal(keptTarget(O, 5, bodies)?.id, 5);
  assert.equal(keptTarget(O, 9, bodies), null);
  assert.equal(keptTarget(O, 12, bodies), null);
});

test('the lock holds until its body is gone or too far, and a drag at nothing keeps it', () => {
  let bodies: LockBody[] = [{ id: 1, x: 100, y: 0 }];
  const lock = new TargetLock(() => bodies);
  assert.equal(lock.pick(O, { x: 1, y: 0 }), 1);
  assert.equal(lock.pick(O, { x: -1, y: 0 }), 1);
  assert.equal(lock.current(O)?.id, 1);
  bodies = [{ id: 1, x: 350, y: 0 }];
  assert.equal(lock.current(O), null);
  assert.equal(lock.locked, null);
  bodies = [{ id: 2, x: 10, y: 0 }];
  assert.equal(lock.pickNearest(O), 2);
  bodies = [];
  assert.equal(lock.current(O), null);
});
