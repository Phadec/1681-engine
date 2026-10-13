/**
 * An aim turned into the eight-way axis the keyboard makes (each part -1, 0 or 1; `stepMover` scales a diagonal),
 * so a step sent along it is one a key could have sent. A part counts once the aim leans past 22.5° towards it.
 */
export function aimAxis(aim: number): { dx: number; dy: number } {
  const c = Math.cos(aim);
  const s = Math.sin(aim);
  const lean = Math.sin(Math.PI / 8);
  return { dx: Math.abs(c) > lean ? Math.sign(c) : 0, dy: Math.abs(s) > lean ? Math.sign(s) : 0 };
}
