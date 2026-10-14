/**
 * FNV-1a over the UTF-16 code units of `text`, as 8 hex digits. Not a defence against tampering (anyone can
 * recompute it); it catches a slot cut short by a full disk, a crash mid-write or a hand edit gone wrong, which is
 * what a save needs to tell before it loads half a world.
 */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
