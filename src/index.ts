/**
 * 1681 Engine: the core's public API, for 2D games in any art style. Pixel-art tools are `1681-engine/pixel`.
 * Anything not exported here or there is internal and may change in any release.
 */

// ── Engine, scenes, entities ──────────────────────────────────────────────────────────────────────────────────────
export { Engine, type EngineOptions, type EngineEvents } from './engine/Engine';
export { Scene, type FlushableInput, type SceneTimer } from './engine/Scene';
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
export { worldZoom, baseZoom, zoomSteps, zoomResolution, fitScale, type PixelZoomOptions } from './core/pixelZoom';
export { Clock } from './core/Clock';
export { runDue, type DueCall } from './core/runDue';
export { Tweener, Tween, type TweenConfig, type TweenTarget, type Steppable } from './core/Tweener';
export { Timeline, type TimelineOptions } from './core/Timeline';
export { TimelineBuilder, type TimelineProps, type TimelineTweenOptions } from './core/TimelineBuilder';
export type { TimelinePosition } from './core/timelinePlace';
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
export { parseAseprite, frameNamed, clipMarkers } from './anim/parseAseprite';
export { tagFrames, tagDirection, tagRepeat } from './anim/asepriteTags';
export { sliceNamed, sliceAt, sliceBorders } from './anim/asepriteSlices';
export type { AsepriteJson, AsepriteJsonFrame, AsepriteJsonTag, AsepriteJsonSlice, AsepriteJsonSliceKey, AsepriteJsonLayer, AsepriteRect, AsepriteSheet, AsepriteFrame, AsepriteTag, AsepriteDirection, AsepriteSlice, AsepriteSliceKey, AsepriteLayer, AsepriteCue, ClipMarker } from './anim/asepriteTypes';
export { loadAseprite, addAsepriteTextures, type AsepriteTextureSink, type AsepriteLoadOptions } from './assets/loadAseprite';
export { AnimStateMachine } from './anim/AnimStateMachine';
export type { AnimStateMachineOptions, AnimStateDef, AnimTransition, AnimCondition, AnimParams, AnimParamDecl, CompareOp } from './anim/animStateTypes';
export { AnimStateComponent, animStateSystem } from './anim/animStateSystem';
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
export { FloatingText, type FloatingTextStyle, type FloatingTextOptions, type FloatOptions } from './fx/FloatingText';
export { inView, type CameraLike } from './fx/viewCull';

// ── Audio ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export { sound, SoundEngine, type SoundOptions } from './audio/SoundEngine';
export { music, MusicPlayer, type PlayOptions as MusicPlayOptions, type MusicOptions, type MusicRoute } from './audio/MusicPlayer';
export { MusicChannel } from './audio/music/MusicChannel';
export { elementVolumeLocked } from './audio/music/musicVoice';
export { registerSounds, type SoundTable } from './audio/soundTable';
export { registerTakes, hasTakes } from './audio/sampleBank';
export { Footsteps, type FootstepOptions, type SurfaceSounds } from './audio/Footsteps';
export { renderRecipe, SYNTH_RATE, type SynthRecipe, type SynthLayer } from './audio/synth';

// ── Input and platform ────────────────────────────────────────────────────────────────────────────────────────────
export { Keyboard } from './input/Keyboard';
export { Actions, PAD_BUTTONS, type Bindings, type ActionsOptions, type PadState } from './input/Actions';
export { parseChord, chordHeld, type KeyChord } from './input/keyChord';
export { aimAxis } from './input/aimAxis';
export { stickVector, stickActive, stickToAxis, STICK_DEAD_ZONE, type StickVector } from './input/stickAxis';
export { LongPress } from './input/longPress';
export { AimGesture, aimPoint, spotReach, spotShare, dragSlop, AIM_TAP_SLOP, AIM_EARLY_SLOP, AIM_PRESS_MS, AIM_CENTRE, type AimGestureOptions, type AimShape, type AimEnd } from './input/AimGesture';
export { TargetLock, pickTarget, nearestTarget, keptTarget, LOCK_PICK_RANGE, LOCK_KEEP_RANGE, LOCK_PICK_CONE, type LockBody, type TargetLockOptions } from './input/TargetLock';
export { Keymap, mergeKeymap, keymapStorage, keyLabel } from './input/Keymap';
export { isTouchUi, setNativeShell, setTouchOverrideKey } from './platform/touch';
export { detectTouch, type TouchEnv } from './input/touchDetect';

// ── Ambient: time of day, weather, colour grade ───────────────────────────────────────────────────────────────────
export { DayClock, clockText, tintNight, mixRgb, type DayClockOptions, type DayKey, type DayPhase, type DayState } from './ambient/DayClock';
export { weatherAt, hash01, type WeatherTable, type WeatherEntry, type WeatherSky, type WeatherState } from './ambient/weather';
export { WeatherLayer, type WeatherLook, type WeatherMotion, type WeatherLayerOptions } from './ambient/WeatherLayer';
export { gradeAt, mixToWhite, type Grade, type GradeState } from './ambient/grade';
export { ColorGrade, type ColorGradeOptions, type GradePlacement } from './ambient/ColorGrade';

// ── Parallax ──────────────────────────────────────────────────────────────────────────────────────────────────────
export { Parallax, type ParallaxOptions } from './parallax/Parallax';
export { ParallaxLayer, type ParallaxLayerOptions, type ParallaxCamera } from './parallax/ParallaxLayer';
export { parallaxOrigin, wrap, spanVisible, placeAxis, type AxisPlacement, type AxisInput } from './parallax/parallaxMath';

// ── Particles ─────────────────────────────────────────────────────────────────────────────────────────────────────
export { Emitter, type EmitterOptions, type SpawnArea } from './particles/Emitter';
export { ParticleSim } from './particles/ParticleSim';
export { ParticleBudget, particleBudget } from './particles/ParticleBudget';
export { sampleCurve, sampleColor, lerpColor, type Curve, type ColorCurve } from './particles/particleCurves';
export { sampleRange, spreadAngle, dueParticles, scaleCount, seededRandom, type Range } from './particles/particleSampling';

// ── Physics ───────────────────────────────────────────────────────────────────────────────────────────────────────
export { PhysicsWorld } from './physics/PhysicsWorld';
export type { PhysicsWorldOptions } from './physics/PhysicsWorldOptions';
export type { SolverSettings } from './physics/ContactSolver';
export { Body } from './physics/Body';
export { Contact, ContactPoint } from './physics/Contact';
export { polygonShape, polygonCentroid, regularPolygon, MAX_POLYGON_VERTICES } from './physics/polygon';
export { tileBodies, tileBodiesFromGrid, mergeTileRects, type TileBodiesOptions, type TileRect } from './physics/tileBodies';
export { physicsSystem } from './physics/physicsSystem';
export { syncToBody, type Positioned } from './physics/syncToBody';
export { drawColliders, colliderColor, COLLIDER_COLORS, type ColliderColors, type ColliderBoxDrawer, type ColliderLineDrawer } from './physics/drawColliders';
export {
  FACE_LEFT,
  FACE_RIGHT,
  FACE_TOP,
  FACE_BOTTOM,
  type Shape,
  type CircleShape,
  type BoxShape,
  type PolygonShape,
  type BodyType,
  type BodyOptions,
  type ContactInfo,
  type PhysicsEvents,
  type RayHit,
  type RaycastOptions,
} from './physics/types';

// ── Navigation ────────────────────────────────────────────────────────────────────────────────────────────────────
export { MinHeap } from './nav/MinHeap';
export { navGrid, navGridFromCollision, isOpen, nearWallCost, canStep, NAV_STEPS, type NavGrid, type NavOptions, type TilePoint } from './nav/navGrid';
export { nearestOpen } from './nav/nearestOpen';
export { findPath, floodFill, reachedCount, octile, type NavGoal, type FindPathOptions } from './nav/findPath';
export { straightenPath, simplifyPath } from './nav/straightenPath';

// ── Saves ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export { SaveStore, type SaveStoreOptions, type SaveInfo, type LoadResult, type LoadFailure } from './save/SaveStore';
export type { SaveBackend } from './save/SaveBackend';
export { MemoryBackend } from './save/MemoryBackend';
export { WebStorageBackend } from './save/WebStorageBackend';
export { migrateSave, MigrationError, type Migrations } from './save/migrateSave';
export { checksum } from './save/checksum';
export { Autosaver, type AutosaverOptions, type AutosaveTimers } from './save/Autosaver';

// ── Scene transitions ─────────────────────────────────────────────────────────────────────────────────────────────
export type { Transition, TransitionContext } from './transitions/Transition';
export { transitionTo, type TransitionMode } from './transitions/transitionTo';
export { tweenDone } from './transitions/tweenDone';
export { FadeTransition, type FadeOptions } from './transitions/FadeTransition';
export { CrossfadeTransition, type CrossfadeOptions } from './transitions/CrossfadeTransition';
export { DitherWipeTransition, type DitherWipeOptions } from './transitions/DitherWipeTransition';
export { BAYER4, DITHER_LEVELS, ditherCovered, wipeLevel } from './transitions/ditherMask';
export { Letterbox, type LetterboxOptions } from './transitions/Letterbox';

// ── Localisation ──────────────────────────────────────────────────────────────────────────────────────────────────
export { Translator, type TranslatorOptions, type Catalog, type PluralForms } from './i18n/Translator';
export { formatMessage, sourceText, CONTEXT_MARK } from './i18n/formatMessage';
export { extractStrings, type ExtractedString, type ExtractOptions } from './i18n/extractStrings';

// ── Diagnostics and debug ─────────────────────────────────────────────────────────────────────────────────────────
export { watchContextLoss, noteContextLoss, rebuildDelayMs, type ContextLossPolicy, type ContextLossVerdict } from './diagnostics/contextLoss';
export { bootWatch, type BootWatch, type BootStall } from './diagnostics/bootWatch';
export { guardRender, describeError } from './diagnostics/renderGuard';
export { maxTextureSize, gpuName } from './diagnostics/gpuInfo';
export { summarizeFrames, percentile, countHitches, looksThrottled, type FrameSummary } from './diagnostics/frameStats';
export { FrameSampler, type FrameSamplerOptions } from './diagnostics/FrameSampler';
export { ErrorDeduper, trimStack } from './diagnostics/ErrorDeduper';
export { captureErrors, type CapturedError, type CaptureErrorsOptions } from './diagnostics/captureErrors';
export { DebugOverlay, type DebugOverlayOptions, type BoxDrawer, type LineDrawer } from './debug/DebugOverlay';
export { FrameStats } from './debug/FrameStats';
export { ErrorLog, type LoggedError } from './debug/ErrorLog';
export { inspectWorld, type EntityRow } from './debug/inspectWorld';
export { DrawCallCounter } from './debug/DrawCallCounter';

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
export {
  LobbyHost,
  LobbyClient,
  LobbyRooms,
  Matchmaker,
  balanceTeams,
  type LobbyHostOptions,
  type LobbyMatch,
  type LobbyClientEvents,
  type LobbyLink,
  type PendingMatch,
  type LobbyRoom,
  type MatchMode,
  type Ticket,
  type FoundMatch,
  type LobbyClientMessage,
  type LobbyServerMessage,
  type LobbyErrorCode,
  type RoomSummary,
  type RoomState,
  type RoomMember,
  type MatchPlayer,
} from './net/lobby';
export { moverToWire, moverFromWire, type ClientMessage, type ServerMessage, type Snapshot, type SpawnInfo, type MoverWire } from './net/protocol';
