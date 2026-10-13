/**
 * Dither Engine — the public API. Anything not exported here is internal and may change in any release.
 */

// ── Engine, scenes, entities ──────────────────────────────────────────────────────────────────────────────────────
export { Engine, type EngineOptions, type EngineEvents } from './engine/Engine';
export { Scene } from './engine/Scene';
export { SceneManager } from './engine/SceneManager';
export { FixedLoop, type FixedLoopOptions } from './engine/FixedLoop';
export {
  World,
  defineComponent,
  defineFields,
  entityIndex,
  system,
  type Entity,
  type ComponentType,
  type System,
  type SystemContext,
  type SystemPhase,
} from './ecs/World';
export type { FieldKind, FieldSpec, FieldsType, FieldValues, Columns } from './ecs/fields';
export { EventBus } from './events/EventBus';
export { engineSettings, type EngineSettings } from './settings';

// ── Rendering core ────────────────────────────────────────────────────────────────────────────────────────────────
export { Stage } from './core/Stage';
export { Camera, type ViewRect } from './core/Camera';
export { Clock } from './core/Clock';
export { Tweener } from './core/Tweener';
export { easeByName } from './core/eases';
export { ObjectFactory } from './core/ObjectFactory';
export { Graphics } from './core/Graphics';
export { PixelLayer } from './core/PixelLayer';
export { Image } from './core/Image';
export { Group } from './core/Group';
export { Rectangle } from './core/Rectangle';
export { Text, type TextStyle } from './core/Text';
export { BitmapLabel, installLabelFont, addLabelGlyphs } from './core/BitmapLabel';
export { Pointer } from './core/Pointer';
export { TextureRegistry, CanvasTexture } from './core/TextureRegistry';
export { AtlasBuilder } from './core/atlas';
export { planAtlas, atlasPageLimit, type AtlasSize } from './core/atlasPlan';
export type { WorldObject } from './core/types';

// ── Pixel art ─────────────────────────────────────────────────────────────────────────────────────────────────────
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
} from './art/pixel';
export { P as PALETTE } from './art/palette';
export { art, litOutline, groundShadow, shadeBox, type PropArt } from './art/propKit';

// ── Skeleton rig ──────────────────────────────────────────────────────────────────────────────────────────────────
export { Skeleton } from './art/rig/Skeleton';
export { HUMANOID_RIG } from './art/rig/humanoid';
export { blendPose, overlay, upperOver } from './art/rig/poseMath';
export type { RigDef, RigPose, Limb, Face, Joints, Point as RigPoint } from './art/rig/rigTypes';
export { ramp, rampTones, hueShade, outlineOf, MATERIALS, type Material, type Ramp } from './art/rig/ramp';
export { selectiveOutline } from './art/rig/selout';

// ── Effects ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Pixel shapes on the 1-px world grid: `pixelPaint.ring(g, …)`, `pixelPaint.arc(g, …)`… */
export * as pixelPaint from './fx/pixelPaint';
/** Colour ramps, grading, dithering and batching under `pixelPaint`. */
export * as pixelTone from './fx/pixelTone';
export { Evaporation, type DeathPixels } from './fx/Evaporation';
export { spritePixels, NO_PIXELS, type PackedPixels, type SpritePixel } from './fx/spritePixels';
export { hitStopMs, recoilPx, recoilAt, RECOIL_MS, hurtFlashMs, hurtFlashGapMs, HEAVY_FLASH_GAP_MS } from './fx/hitStop';
export { inView } from './fx/viewCull';

// ── Light ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export { Darkness, WARM_LIGHT, LAMP_DIM, CARRIED_LIGHT } from './light/Darkness';
export { flashLight, carriedLight, liveLights, clearLights, type TransientLight } from './light/lights';

// ── Audio ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export { sound } from './audio/SoundEngine';
export { registerSounds, type SoundTable } from './audio/soundTable';
export { registerTakes, hasTakes } from './audio/sampleBank';
export { renderRecipe, SYNTH_RATE, type SynthRecipe, type SynthLayer } from './audio/synth';

// ── Input and platform ────────────────────────────────────────────────────────────────────────────────────────────
export { Keyboard } from './input/Keyboard';
export { aimAxis } from './input/aimAxis';
export { stickVector, stickActive, stickToAxis, STICK_DEAD_ZONE, type StickVector } from './input/stickAxis';
export { LongPress } from './input/longPress';
export { isTouchUi, setNativeShell } from './platform/touch';

// ── Networking and simulation ─────────────────────────────────────────────────────────────────────────────────────
export {
  TILE_SIZE,
  INPUT_STEP_RATE,
  INPUT_STEP_DT,
  INPUT_FLAG_DASH,
  BODY_HALF_WIDTH,
  BODY_HALF_HEIGHT,
  type InputStep,
  type MovementParams,
  type EntityUpdate,
} from './net/constants';
export {
  createCollisionGrid,
  createMover,
  stepMover,
  moveX,
  moveY,
  bodyCollides,
  isSolidTile,
  blocksShot,
  DIAGONAL,
  type CollisionGrid,
  type CollisionGridOptions,
  type MoverState,
} from './net/movement';
export {
  encodeSnapshotFrame,
  decodeSnapshotFrame,
  encodeUpdates,
  decodeUpdates,
  quantizeUpdates,
  UPDATE_RECORD_BYTES,
  type SnapshotLike,
} from './net/snapshotCodec';
export { CADENCE, cadenceEarly, cadenceNext } from './net/cadence';
export { serverNow, serverOffset, noteServerTime, resetServerClock } from './net/serverClock';
