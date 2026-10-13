import { Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import { TILE_SIZE } from '../net/constants';
import type { Stage } from '../core/Stage';
import { lightRadius, liveLights } from './lights';
import { isTouchUi } from '../platform/touch';

/**
 * The dark underground, and the lights that are cut out of it.
 *
 * The obvious way to do this — a black sheet with glowing blobs added on top — is what makes a dungeon look
 * like it is standing in fog: adding light to black gives grey, so the floor inside the "light" is a washed-out
 * haze rather than lit stone. What reads as light is the opposite operation. The sheet of night and the lamps
 * are drawn into a texture of their own, the lamps **erasing** the night rather than adding to it, and that
 * texture is laid over the world. Inside a lamp there is simply no night left, so the art underneath shows at
 * its own colour; outside one there is nothing but black. That is the whole trick.
 *
 * It lives in screen space because the hole has to stay under the torch as the camera moves, and a texture the
 * size of the window is far cheaper than one the size of the map.
 */
/** How often a flicker alone redraws the sheet (≈15 a second): a torch's wobble does not need 60. */
const FLICKER_MS = 66;
/** The least time between two redraws on a phone (≈30 a second, what the phones run at by default). */
const PHONE_MS = 33;
/** World pixels of night drawn past each edge of the window: room for a shake and for a phone's held redraw. */
const MARGIN = 8;

/*
 * Lit the way pixel art lights a room: the night is drawn one texel to one **world** pixel, lined up
 * with the camera so its texels sit exactly on the art's pixels, and every light's falloff is a few levels of alpha
 * blended by an ordered (Bayer 4×4) dither in those world pixels — far off a stipple, close a solid fill — instead of
 * a smooth gradient laid over pixel art (which read as fog) or hard rings (which read as a target). A torch's
 * flicker is its radius stepping a whole pixel, not a sprite scaled by fractions.
 */

/** How a light falls off with `d`, a share of its radius: a bright core and a long thinning tail. */
const holeAt = (d: number): number => Math.min(1, Math.pow(Math.max(0, 1 - d * d), 1.5) * 1.15);
/** The colour a light lays on what it lights: strongest at the heart, gone well before its edge. */
const washAt = (d: number): number => Math.pow(Math.max(0, 1 - d), 2);
/** Alpha levels the dither blends between: the hole's and the colour's. */
const HOLE_LEVELS = 4;
const WASH_LEVELS = 3;
/** How strongly a light colours what it lights, before the night's own depth weighs it. */
const WASH_ALPHA = 0.3;
/** A light's height over its width: the ground is seen at a slant, so a pool of light is an ellipse. */
const SQUASH = 0.85;
/** A plain light's colour (a lamp nobody named one for, the light a body carries): warm, as flame is. */
export const WARM_LIGHT = 0xffc27a;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Radii are painted at every second pixel up to 24 and every eighth above, so a shrinking flash reuses a few textures
 * (each new one is a canvas and an upload; one per pixel made the first flashes hitch).
 */
const bucket = (r: number): number => (r <= 24 ? Math.max(2, Math.round(r / 2) * 2) : Math.round(r / 8) * 8);
/** Every bucket a light can take, painted ahead one per task (`warm`), so no flash pays for its texture. */
const BUCKETS = [...new Set(Array.from({ length: 160 }, (_, r) => bucket(r + 1)))];
/** How often transient lights alone redraw the sheet (≈30 a second): a flash fading needs no more. */
const FLASH_MS = 33;

const textures = new Map<string, Texture>();

let warming = false;

/** Paints every falloff ahead, one a task, so the first flashes find theirs made. */
function warm(): void {
  if (warming) return;
  warming = true;
  const todo = BUCKETS.flatMap((r) => [['hole', r], ['wash', r]] as const);
  const next = () => {
    const item = todo.shift();
    if (!item) return;
    falloff(item[0], item[1]);
    setTimeout(next, 0);
  };
  setTimeout(next, 0);
}

/** One falloff at radius `r` world px, one texel a world pixel, dithered in place. */
function falloff(kind: 'hole' | 'wash', r: number): Texture {
  const key = `${kind}${r}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const w = r * 2;
  const h = Math.max(2, Math.round(r * 2 * SQUASH));
  const levels = kind === 'hole' ? HOLE_LEVELS : WASH_LEVELS;
  const curve = kind === 'hole' ? holeAt : washAt;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  // a browser out of canvas memory (iOS) gives no context: no light this time, and the next asks again
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.EMPTY;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / r, (y + 0.5 - h / 2) / (r * SQUASH));
      if (d >= 1) continue;
      const v = Math.min(levels, Math.floor(curve(d) * levels + BAYER[(y % 4) * 4 + (x % 4)]!)) / levels;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(v * 255);
    }
  ctx.putImageData(img, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  textures.set(key, texture);
  return texture;
}

/** A light's two marks on the night: the hole it erases, and the colour it lays over what shows through. */
interface LightSprites {
  hole: Sprite;
  wash: Sprite;
}

export class Darkness {
  private readonly scratch = new Container();
  private readonly sheet: Sprite;
  /** Every hole is erased before any colour is laid, or a later hole would wipe an earlier light's colour away. */
  private readonly holes = new Container();
  private readonly washes = new Container();
  private readonly lamps: { sprites: LightSprites; x: number; y: number; r: number; flicker: number }[] = [];
  /** The transient lights (`lights.ts`), reused frame to frame. */
  private readonly flashes: LightSprites[] = [];
  private rt: RenderTexture;
  /**
   * On the screen layer, laid over the world with its exact transform by the camera (`Camera.follow`), shake included:
   * the night is drawn in world pixels round the unshaken camera and only this layer moves with a shake, so a shaking
   * screen does not redraw the night every frame.
   */
  private readonly layer = new Container();
  private readonly view: Sprite;
  /** The light the player carries: the only one that follows them, and the last one they lose. */
  private readonly carried: LightSprites;
  private readonly unsubscribeResize: () => void;
  /** Lamps that flicker: while one does (or the player carries a light) every frame differs. */
  private flickering = 0;
  /** Something other than the camera changed what the night looks like (a lamp added, dimmed, the window resized). */
  private dirty = true;
  /** What the last drawn frame was drawn from: the texture, the camera's texel and the shade. */
  private drawn = '';
  /** The carried light's place at the last redraw (it follows the body). */
  private carriedAt = '';
  /** When the sheet was last redrawn. */
  private drawnAt = -Infinity;
  /** The world pixel the night's top-left texel stands on. */
  private ox = 0;
  private oy = 0;
  /** The night texture's size in world pixels, and the zoom it was made for. */
  private rtKey = '';
  /** The lamps' colour turned down (`setLampsDimmed`). */
  private dimLamps = false;
  /** A phone redraws the night at most `PHONE_MS` apart, whatever moves (`isTouchUi`). */
  private readonly phone = isTouchUi();

  constructor(
    private readonly stage: Stage,
    private color: number,
    private alpha: number,
  ) {
    // a flat sheet of night over the whole window: one white pixel, tinted and stretched
    this.sheet = new Sprite({ texture: Texture.WHITE });
    this.scratch.addChild(this.sheet, this.holes, this.washes);
    this.carried = this.light(0xfff0dc);

    this.rt = RenderTexture.create({ width: 1, height: 1 });
    this.view = new Sprite({ texture: this.rt });
    this.layer.addChild(this.view);
    stage.screen.addChild(this.layer);
    stage.cameras.main.follow(this.layer);
    this.unsubscribeResize = stage.onResize(() => (this.dirty = true));
    warm();
  }

  /** A hole and its colour, added to the night's layers. */
  private light(color: number): LightSprites {
    const hole = new Sprite({ texture: falloff('hole', 8) });
    hole.blendMode = 'erase';
    this.holes.addChild(hole);
    const wash = new Sprite({ texture: falloff('wash', 8) });
    wash.tint = color;
    this.washes.addChild(wash);
    return { hole, wash };
  }

  /** A lamp fixed in the world: a torch on a wall, the seep in its chamber, a crystal in a seam, in its own colour. */
  addLamp(x: number, y: number, radius: number, flicker = 0, color = WARM_LIGHT): void {
    this.lamps.push({ sprites: this.light(color), x, y, r: radius, flicker });
    if (flicker) this.flickering++;
    this.dirty = true;
  }

  /**
   * Changes how dark and what colour the sheet is (the outdoor night, `NightShade`, deepens and lifts with the
   * world clock). A sheet with no alpha left is neither drawn nor redrawn, so a map at noon pays nothing for its night.
   */
  setShade(color: number, alpha: number): void {
    this.color = color;
    this.alpha = alpha;
    this.layer.visible = alpha > 0.004;
  }

  /**
   * Dimmed lamps lay only `LAMP_DIM` of their colour on the dark (a "fewer ambient lights" setting). The holes they
   * cut stay as wide, so a dark place is still seen by them.
   */
  setLampsDimmed(dim: boolean): void {
    if (dim === this.dimLamps) return;
    this.dimLamps = dim;
    this.dirty = true;
  }

  /**
   * The night's own texture, one texel a world pixel and `MARGIN` to spare on each side (a shake, or a camera that
   * moved while a phone waits for its next redraw, never shows its edge), remade when the window or the zoom changes:
   * at zoom 2 or 3 it is a quarter or a ninth of the screen's pixels. True when it was remade.
   */
  private fit(w: number, h: number, zoom: number): boolean {
    const tw = Math.ceil(w / zoom) + MARGIN * 2;
    const th = Math.ceil(h / zoom) + MARGIN * 2;
    const key = `${tw},${th},${zoom}`;
    if (key === this.rtKey) return false;
    this.rtKey = key;
    this.rt.destroy(true);
    this.rt = RenderTexture.create({ width: tw, height: th });
    this.rt.source.scaleMode = 'nearest';
    this.view.texture = this.rt;
    return true;
  }

  /** Redraws the night with this frame's holes in it, when anything in it changed. `px`/`py` is where the player stands. */
  update(now: number, px: number, py: number, carriedRadius: number): void {
    if (!this.layer.visible) return;
    const cam = this.stage.cameras.main;
    const zoom = cam.zoom || 1;
    const remade = this.fit(this.stage.width, this.stage.height, zoom);
    // the texel grid follows the camera (never its shake) in whole world pixels
    const ox = Math.floor(cam.scrollX) - MARGIN;
    const oy = Math.floor(cam.scrollY) - MARGIN;
    const key = `${ox},${oy},${this.rtKey},${this.color},${this.alpha}`;
    const lights = liveLights(now);
    const carriedAt = carriedRadius > 0 ? `${Math.round(px)},${Math.round(py)},${Math.round(carriedRadius)}` : '';
    // the light a body carries goes where it goes; a fight's flashes fade (`FLASH_MS`), torches wobble (`FLICKER_MS`)
    const since = now - this.drawnAt;
    const due =
      this.dirty ||
      key !== this.drawn ||
      carriedAt !== this.carriedAt ||
      (lights.length > 0 && since >= FLASH_MS) ||
      ((carriedRadius > 0 || this.flickering > 0) && since >= FLICKER_MS);
    if (!due) return;
    // a phone holds every redraw `PHONE_MS` apart (redrawing the night at 60 a second runs it hot); the night stays
    // pinned to the world meanwhile, and only a camera about to show the texture's edge cannot wait
    const edge = Math.abs(ox - this.ox) >= MARGIN - 1 || Math.abs(oy - this.oy) >= MARGIN - 1;
    if (this.phone && since < PHONE_MS && !remade && !edge) return;
    this.dirty = false;
    this.drawn = key;
    this.carriedAt = carriedAt;
    this.drawnAt = now;
    this.ox = ox;
    this.oy = oy;
    this.view.position.set(ox, oy);
    this.sheet.width = this.rt.width;
    this.sheet.height = this.rt.height;
    this.sheet.position.set(0, 0);
    this.sheet.tint = this.color;
    this.sheet.alpha = this.alpha;

    // the colour a light lays shows as much as the night is deep: a dungeon's lamps colour their stone fully, a dusk
    // street's only a little
    const wash = WASH_ALPHA * Math.min(1, this.alpha * 1.4);
    if (carriedRadius <= 0) this.hide(this.carried);
    else this.place(this.carried, px, py - 6, carriedRadius * (1 + Math.sin(now / 260) * 0.03 + Math.sin(now / 90) * 0.015), wash * 0.5);
    const lampWash = this.dimLamps ? wash * LAMP_DIM : wash;
    for (const l of this.lamps) {
      // torchlight is never still: each one wobbles on its own phase so a corridor of them does not pulse as one,
      // and its colour breathes with it
      const wobble = l.flicker ? 1 + Math.sin(now / 190 + l.flicker) * 0.05 + Math.sin(now / 71 + l.flicker) * 0.03 : 1;
      this.place(l.sprites, l.x, l.y, l.r * wobble, lampWash * (l.flicker ? 0.9 + (wobble - 1) * 2 : 1));
    }
    while (this.flashes.length < lights.length) this.flashes.push(this.light(WARM_LIGHT));
    for (let i = 0; i < this.flashes.length; i++) {
      const l = lights[i];
      const f = this.flashes[i]!;
      if (!l) {
        this.hide(f);
        continue;
      }
      f.wash.tint = l.color;
      // a flash colours what it lights more than a lamp does: it is the brightest thing in the room for its moment
      this.place(f, l.x, l.y, lightRadius(l, now), Math.min(0.6, wash * 1.6));
    }

    this.stage.app.renderer.render({ container: this.scratch, target: this.rt, clear: true });
  }

  private hide(l: LightSprites): void {
    l.hole.visible = false;
    l.wash.visible = false;
  }

  /** Lays light `l` at world (wx, wy), `r` px across its radius, in the night's world-pixel grid. */
  private place(l: LightSprites, wx: number, wy: number, r: number, wash: number): void {
    const R = bucket(r);
    const cx = Math.round(wx) - this.ox;
    const cy = Math.round(wy) - this.oy;
    // a light wholly off the texture cannot be seen, so it is not drawn
    if (r < 1 || cx < -R || cy < -R || cx > this.rt.width + R || cy > this.rt.height + R) {
      this.hide(l);
      return;
    }
    l.hole.texture = falloff('hole', R);
    l.wash.texture = falloff('wash', R);
    for (const sprite of [l.hole, l.wash]) {
      sprite.visible = true;
      sprite.position.set(cx - R, cy - Math.round(R * SQUASH));
    }
    l.wash.alpha = wash;
    l.wash.visible = wash > 0.01;
  }

  destroy(): void {
    this.unsubscribeResize();
    this.stage.cameras.main.unfollow(this.layer);
    this.layer.destroy({ children: true });
    this.rt.destroy(true);
    this.scratch.destroy({ children: true, context: true });
  }
}

/** What is left of a lamp's glow and colour while lamps are dimmed (`setLampsDimmed`). */
export const LAMP_DIM = 0.35;

/** World units of light the player carries underground — about five tiles of certainty in any direction. */
export const CARRIED_LIGHT = TILE_SIZE * 5;
