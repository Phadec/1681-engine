/**
 * Projects made in LDtk (https://ldtk.io), read into the same `TileMap` a Tiled map becomes, so `TilemapView` draws
 * an LDtk level and `collisionFromTiled` / `objectsOf` work on it unchanged. What LDtk has and Tiled has not —
 * IntGrid values, entity fields with their full JSON, world positions — rides beside the map on `LdtkLevel`.
 *
 * Pure: no Pixi, no DOM. The parser is `parseLdtk` (in `ldtkParse.ts`); this file holds the model and its helpers.
 */
import type { TileMap, Tileset } from './tiled';

/** A field's value as LDtk exports it: a number, string, boolean, null, a point `{ cx, cy }`, an entity ref, an array… */
export type LdtkFieldValue = unknown;

/** `Free` and `GridVania` place levels by hand; the `Linear*` layouts line them up in order. */
export type LdtkWorldLayout = 'Free' | 'GridVania' | 'LinearHorizontal' | 'LinearVertical';

/** One IntGrid layer's values: what a level says each cell is (wall, water, ladder…), drawn or not. */
export interface LdtkIntGrid {
  name: string;
  width: number;
  height: number;
  gridSize: number;
  /** Row-major values, 0 = empty. */
  values: Int32Array;
  /** The identifier LDtk gives each value (`1 → "wall"`); values named nothing are absent. */
  names: Map<number, string>;
  offsetX: number;
  offsetY: number;
}

export interface LdtkEntity {
  iid: string;
  /** The entity definition's identifier (`Player`, `Chest`…). */
  identifier: string;
  /** The pivot point in level px (the layer's offset included): where LDtk shows the entity standing. */
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  /** The grid cell it stands in. */
  cx: number;
  cy: number;
  tags: string[];
  /** Every field instance by identifier, as exported (`Point`s, arrays and entity refs included). */
  fields: Record<string, LdtkFieldValue>;
  /** The layer it was placed on. */
  layer: string;
}

export interface LdtkLevel {
  identifier: string;
  iid: string;
  uid: number;
  /** The level's top-left corner in world px (worked out for the `Linear*` layouts, which store -1). */
  worldX: number;
  worldY: number;
  worldDepth: number;
  pxWidth: number;
  pxHeight: number;
  bgColor: string;
  fields: Record<string, LdtkFieldValue>;
  /**
   * The level as a `TileMap`: one tile layer per Tiles, AutoLayer and auto-tiled IntGrid layer (a layer stacking
   * several tiles in a cell is split into `name`, `name#1`… drawn above it), one object layer per Entities layer, in
   * draw order (LDtk lists its layers top first; here the bottom comes first, as in Tiled).
   */
  map: TileMap;
  intGrids: Map<string, LdtkIntGrid>;
  entities: LdtkEntity[];
  /** The separate `.ldtkl` file this level lives in, relative to the project, when the project saves levels apart. */
  externalRelPath?: string;
  /** False for an external level whose file was not handed to `parseLdtk`: everything but its layers is known. */
  loaded: boolean;
}

export interface LdtkWorld {
  identifier: string;
  iid: string;
  layout: LdtkWorldLayout;
  gridWidth: number;
  gridHeight: number;
  levels: LdtkLevel[];
}

export interface LdtkProject {
  jsonVersion: string;
  defaultGridSize: number;
  bgColor: string;
  /** Every tileset with an image, gids allotted in definition order (the same in every level's `map`). */
  tilesets: Tileset[];
  /** One world, or several in a multi-worlds project. */
  worlds: LdtkWorld[];
  /** Every level of every world. */
  levels: LdtkLevel[];
}

export function levelByName(project: LdtkProject, identifier: string): LdtkLevel | undefined {
  return project.levels.find((l) => l.identifier === identifier || l.iid === identifier);
}

/** The level whose rectangle holds world point (x, y), the deepest-listed first; null between levels. */
export function levelAt(levels: readonly LdtkLevel[], x: number, y: number, depth?: number): LdtkLevel | null {
  for (const l of levels) {
    if (depth !== undefined && l.worldDepth !== depth) continue;
    if (x >= l.worldX && y >= l.worldY && x < l.worldX + l.pxWidth && y < l.worldY + l.pxHeight) return l;
  }
  return null;
}

/** An IntGrid cell's value; 0 outside the grid. */
export function intGridAt(grid: LdtkIntGrid, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) return 0;
  return grid.values[cy * grid.width + cx]!;
}

/** Every entity of a level (optionally only one identifier). */
export function entitiesOf(level: LdtkLevel, identifier?: string): LdtkEntity[] {
  return identifier === undefined ? level.entities : level.entities.filter((e) => e.identifier === identifier);
}
