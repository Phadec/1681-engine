/**
 * Dither, Lantern Engine's pixel-art module: `import { … } from 'lantern-engine/pixel'`.
 *
 * Everything here works on the world's own pixel grid: rects batched into one texture, shapes shaded by hue-shifted
 * ramps and faded by ordered dither, dithered lighting, bodies that evaporate into their own pixels. Start the engine
 * with `pixelPerfect: true` so textures stay sharp and the camera lands on whole pixels.
 */

export { PixelLayer, addPixelLayer } from './PixelLayer';
export {
  PixelGrid,
  PixelWindow,
  CLEAR,
  rgba,
  hex,
  channels,
  shade,
  mix,
  withAlpha,
  toCss,
  hash2,
  mulberry32,
  valueNoise,
  makeSheet,
  upscale,
  type Color,
} from './pixel';
export { P as PALETTE } from './palette';
export { art, litOutline, groundShadow, shadeBox, type PropArt } from './propKit';
export {
  ramp,
  rampTones,
  hueShade,
  outlineOf,
  registerMaterial,
  MATERIALS,
  RAMP_FACTOR_SET,
  type Material,
  type BuiltinMaterial,
  type MaterialLight,
  type RampFactors,
  type Ramp,
} from './ramp';
export { selectiveOutline } from './selout';

/** Pixel shapes on the 1-px world grid: `pixelPaint.ring(g, …)`, `pixelPaint.arc(g, …)`… */
export * as pixelPaint from './pixelPaint';
/** Colour ramps, grading, dithering and batching under `pixelPaint`. */
export * as pixelTone from './pixelTone';
export { registerHandRamps } from './pixelTone';
export { Evaporation, type DeathPixels } from './Evaporation';
export { spritePixels, NO_PIXELS, PackedPixels, type SpritePixel } from './spritePixels';

export { Darkness, WARM_LIGHT, LAMP_DIM, CARRIED_LIGHT } from './Darkness';
export { flashLight, carriedLight, liveLights, clearLights, type TransientLight } from './lights';
