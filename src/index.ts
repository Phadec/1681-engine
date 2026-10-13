/**
 * Lantern Engine: the core's public API, for 2D games in any art style. Pixel-art tools are `lantern-engine/pixel`.
 * Anything not exported here or there is internal and may change in any release.
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
  type ComponentValues,
} from './ecs/World';
export type { FieldKind, FieldSpec, FieldsType, FieldValues, Columns, ArrayOf } from './ecs/fields';
export { EventBus } from './events/EventBus';
export { engineSettings, type EngineSettings, type SettingsListener } from './settings';

// ── Rendering core ────────────────────────────────────────────────────────────────────────────────────────────────
export { Stage } from './core/Stage';
export { Camera, type ViewRect, type TrackOptions } from './core/Camera';
export { Clock } from './core/Clock';
export { Tweener, Tween, type TweenConfig, type TweenTarget } from './core/Tweener';
export { easeByName, type EaseFn } from './core/eases';
export { ObjectFactory } from './core/ObjectFactory';
export { Graphics, type Vec2 } from './core/Graphics';
export { Image } from './core/Image';
export { Group } from './core/Group';
export { Rectangle } from './core/Rectangle';
export { Text, type TextStyle } from './core/Text';
export { BitmapLabel, installLabelFont, addLabelGlyphs } from './core/BitmapLabel';
export { Pointer } from './core/Pointer';
export { TextureRegistry, CanvasTexture } from './core/TextureRegistry';
export { AtlasBuilder } from './core/atlas';
export { planAtlas, atlasPageLimit, type AtlasSize, type AtlasPlan, type AtlasPage } from './core/atlasPlan';
export type { WorldObject } from './core/types';

// ── Assets, animation, tilemaps ─────────────────────────────────────────────────────────────────────────────────
export { AssetLoader, resolveUrl, type AssetLoaderOptions, type TilemapAssetOptions, type LoadProgress, type TextureSink } from './assets/AssetLoader';
export { Animator, type AnimationClip, type AnimationClips } from './anim/Animator';
export { animationSystem, SpriteComponent, AnimationComponent } from './anim/animationSystem';
export {
  parseTiled,
  tileAt,
  tileRect,
  gidOf,
  layerByName,
  objectsOf,
  FLIP_H,
  FLIP_V,
  FLIP_D,
  type TileMap,
  type TileLayer,
  type ObjectLayer,
  type MapLayer,
  type MapObject,
  type Tileset,
  type Properties,
  type TiledPropertyValue,
} from './tilemap/tiled';
export { collisionFromTiled, type TiledCollisionOptions } from './tilemap/collision';
export { TilemapView, type TilemapViewOptions } from './tilemap/TilemapView';

// ── Skeleton rig ──────────────────────────────────────────────────────────────────────────────────────────────────
export { Skeleton } from './rig/Skeleton';
export { HUMANOID_RIG } from './rig/humanoid';
export { blendPose, overlay, upperOver } from './rig/poseMath';
export type { RigDef, RigPose, Limb, Face, Joints, Point as RigPoint } from './rig/rigTypes';
export { HUMANOID_POSES, HUMANOID_CLIPS, type HumanoidClip } from './rig/humanoidPoses';
export { PosePlayer, type PoseClip } from './rig/PosePlayer';
export { RigView, RIG_PARTS, type RigPart, type PartSkin, type RigSkin, type RigViewOptions } from './rig/RigView';

// ── Light ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export { LightLayer, type Light, type LightLayerOptions } from './light/LightLayer';

// ── Game feel ─────────────────────────────────────────────────────────────────────────────────────────────────────
export { hitStopMs, recoilPx, recoilAt, RECOIL_MS, hurtFlashMs, hurtFlashGapMs, HEAVY_FLASH_GAP_MS } from './fx/hitStop';
export { inView, type CameraLike } from './fx/viewCull';

// ── Audio ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export { sound, SoundEngine, type SoundOptions } from './audio/SoundEngine';
export { music, MusicPlayer, type PlayOptions as MusicOptions } from './audio/MusicPlayer';
export { registerSounds, type SoundTable } from './audio/soundTable';
export { registerTakes, hasTakes } from './audio/sampleBank';
export { renderRecipe, SYNTH_RATE, type SynthRecipe, type SynthLayer } from './audio/synth';

// ── Input and platform ────────────────────────────────────────────────────────────────────────────────────────────
export { Keyboard } from './input/Keyboard';
export { Actions, PAD_BUTTONS, type Bindings, type ActionsOptions, type PadState } from './input/Actions';
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
export { PredictedMover } from './net/PredictedMover';
export { InterpolationBuffer, type InterpolatedState } from './net/InterpolationBuffer';
export { Room, type RoomPlayer, type RoomOptions } from './net/Room';
export { RoomHost, type HostSocket, type RoomHostOptions } from './net/RoomHost';
export { Connection, type ConnectionEvents, type ConnectionOptions } from './net/Connection';
export { moverToWire, moverFromWire, type ClientMessage, type ServerMessage, type Snapshot, type SpawnInfo, type MoverWire } from './net/protocol';
