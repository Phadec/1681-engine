/** Where the world's grid texture goes this frame (`gridPlacement`). */
export interface GridPlacement {
  /** The world pixel the texture's top-left texel shows. */
  readonly tx: number;
  readonly ty: number;
  /** The texture's size in texels: the screen's width and height in world pixels, plus room for the fraction. */
  readonly width: number;
  readonly height: number;
  /** Where the texture's top-left corner lands on screen (screen px, whole backing pixels). */
  readonly x: number;
  readonly y: number;
}

/**
 * The pixel grid's arithmetic (`PixelGrid`). `originX/Y` is where the camera put the world's origin on screen (the
 * scroll, plus any shake), `zoom` screen pixels a world pixel, `resolution` backing pixels a screen pixel. The texture
 * starts on the whole world pixel at the screen's corner and is moved by what is left over, rounded to a backing pixel,
 * so a world pixel never lands between two.
 */
export function gridPlacement(originX: number, originY: number, zoom: number, resolution: number, screenWidth: number, screenHeight: number): GridPlacement {
  const z = zoom || 1;
  const tx = Math.floor(-originX / z);
  const ty = Math.floor(-originY / z);
  return {
    tx,
    ty,
    width: Math.ceil(screenWidth / z) + 2,
    height: Math.ceil(screenHeight / z) + 2,
    x: Math.round((originX + tx * z) * resolution) / resolution,
    y: Math.round((originY + ty * z) * resolution) / resolution,
  };
}
