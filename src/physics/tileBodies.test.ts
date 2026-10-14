import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCollisionGrid } from '../net/movement.ts';
import { mergeTileRects, tileBodies, tileBodiesFromGrid } from './tileBodies.ts';
import { FACE_BOTTOM, FACE_TOP } from './types.ts';

test('a floor is one box and a wall one tall box', () => {
  const rects = mergeTileRects(10, 5, (tx, ty) => ty === 4 || (tx === 0 && ty < 4));
  assert.deepEqual(
    rects.map((r) => [r.x0, r.y0, r.x1, r.y1]).sort(),
    [
      [0, 0, 0, 3],
      [0, 4, 9, 4],
    ],
  );
});

test('boxes sit on the tiles and mark the faces lying against more ground', () => {
  const [wall, floor] = tileBodies(10, 5, 16, (tx, ty) => ty === 4 || (tx === 0 && ty < 4), { originX: 100 }).sort((a, b) => a.minY - b.minY);
  assert.deepEqual([wall!.minX, wall!.minY, wall!.maxX, wall!.maxY], [100, 0, 116, 64]);
  assert.deepEqual([floor!.minX, floor!.minY, floor!.maxX, floor!.maxY], [100, 64, 260, 80]);
  assert.equal(wall!.internalFaces, FACE_BOTTOM, 'the wall stands on the floor');
  assert.equal(floor!.internalFaces & FACE_TOP, 0, 'the floor is only partly covered');
  assert.ok(floor!.isStatic);
});

test('a CollisionGrid converts the same way', () => {
  const grid = createCollisionGrid(4, 2, 16, '00001111');
  const bodies = tileBodiesFromGrid(grid);
  assert.equal(bodies.length, 1);
  assert.deepEqual([bodies[0]!.minX, bodies[0]!.minY, bodies[0]!.maxX, bodies[0]!.maxY], [0, 16, 64, 32]);
});
