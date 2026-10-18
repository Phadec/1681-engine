import { Container, Matrix } from 'pixi.js';

interface Label {
  readonly obj: Container;
  /** The container the game put it in (a body's, or the world itself); the label follows it. */
  home: Container | null;
  /** Its stand-in on the label layer, carrying the home's place, visibility and alpha. */
  wrap: Container | null;
  /**
   * What was last laid on the stand-in — the matrix (a, b, c, d, tx, ty), alpha, depth and whether it showed — so a
   * label whose home did not move costs no `setFromMatrix` (a decomposition with trigonometry, which also marks the
   * stand-in's transform changed for Pixi): a town's standing NPC names took ~9% of a throttled frame every frame.
   */
  last: Float64Array | null;
}

/**
 * The world's text kept at screen resolution while the rest of the world is drawn one texel to a world pixel
 * (`PixelGrid`): a small font squeezed into world pixels cannot be read. Each tracked label (every `add.text` and
 * `add.label`; `Stage.keepSharp` for one made elsewhere) is lifted out of the container it was put in and hung on a
 * stand-in on this layer, which copies that container's transform relative to the world, its visibility and alpha every
 * frame, so the game keeps writing the label's own position, text and alpha as before. All of them draw over the world,
 * sorted by the depth of the world's child they belong to; a label's container destroyed takes the label with it.
 */
export class SharpText {
  readonly layer = new Container({ sortableChildren: true });
  private readonly labels = new Set<Label>();
  private readonly m = new Matrix();
  /** Labels tracked since the last sweep for destroyed ones: off, nothing else sweeps them. */
  private sinceSweep = 0;

  constructor(private readonly world: Container) {}

  track(obj: Container): void {
    this.labels.add({ obj, home: null, wrap: null, last: null });
    if (++this.sinceSweep >= 256) this.prune();
  }

  /** Lays the layer over the world (`origin`: where the world's origin lands on screen) and every label on its home. */
  sync(origin: { x: number; y: number }, zoom: number): void {
    this.layer.position.set(origin.x, origin.y);
    this.layer.scale.set(zoom);
    for (const l of this.labels) {
      const o = l.obj;
      if (o.destroyed) {
        this.drop(l);
        continue;
      }
      // just made, or the game put it somewhere else since
      if (o.parent && o.parent !== l.wrap) {
        l.home = o.parent;
        l.wrap ??= this.layer.addChild(new Container());
        l.wrap.addChild(o);
        l.last = null;
      }
      const home = l.home;
      const wrap = l.wrap;
      if (!home || !wrap) continue;
      if (home.destroyed) {
        // it went down with its body, as it would have in the world
        o.destroy();
        this.drop(l);
        continue;
      }
      this.place(l, home, wrap, o);
    }
  }

  /** Every label back in its home (the grid switched off), the stand-ins gone. */
  release(): void {
    for (const l of this.labels) {
      const { obj: o, home, wrap } = l;
      if (o.destroyed) {
        this.drop(l);
        continue;
      }
      if (home && wrap && o.parent === wrap) {
        if (home.destroyed) o.destroy();
        else home.addChild(o);
      }
      wrap?.destroy();
      l.wrap = null;
      l.home = null;
      l.last = null;
    }
  }

  /** Forgets labels the game destroyed while nothing synced (the grid off). */
  prune(): void {
    this.sinceSweep = 0;
    for (const l of this.labels) if (l.obj.destroyed) this.drop(l);
  }

  destroy(): void {
    this.release();
    this.labels.clear();
    this.layer.destroy({ children: true });
  }

  private place(l: Label, home: Container, wrap: Container, o: Container): void {
    const m = this.m.identity();
    let shown = true;
    let alpha = 1;
    let top = home;
    for (let c: Container | null = home; c !== this.world; c = c.parent) {
      // a home taken off the world (a pooled body) shows nothing
      if (!c) {
        shown = false;
        break;
      }
      if (!c.visible || !c.renderable) shown = false;
      alpha *= c.alpha;
      c.updateLocalTransform();
      m.prepend(c.localTransform);
      top = c;
    }
    // a body's labels sort with the body; text laid on the world itself keeps its own depth
    const z = home === this.world ? o.zIndex : top.zIndex;
    const last = (l.last ??= new Float64Array(9).fill(NaN));
    if (shown === (last[8] === 1) && (!shown || (last[0] === m.a && last[1] === m.b && last[2] === m.c && last[3] === m.d && last[4] === m.tx && last[5] === m.ty && last[6] === alpha && last[7] === z))) return;
    last[8] = shown ? 1 : 0;
    wrap.visible = shown;
    if (!shown) return;
    last[0] = m.a;
    last[1] = m.b;
    last[2] = m.c;
    last[3] = m.d;
    last[4] = m.tx;
    last[5] = m.ty;
    last[6] = alpha;
    last[7] = z;
    wrap.setFromMatrix(m);
    wrap.alpha = alpha;
    wrap.zIndex = z;
  }

  private drop(l: Label): void {
    l.wrap?.destroy();
    this.labels.delete(l);
  }
}
