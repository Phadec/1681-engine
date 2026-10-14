import { useState } from 'react';
import { pixelFit } from './placement';
import { useCx } from './UiProvider';

export interface PixelImageProps {
  src: string;
  /** The box, CSS px. */
  width: number;
  height: number;
  /** Image pixels the URL already spends on one art pixel (a sheet painted at 4x). */
  upscaled?: number;
  /** Caps the multiple, so a row of sprites of different sizes keeps their sizes against each other. */
  maxScale?: number;
  alt?: string;
  className?: string;
}

/**
 * A sprite whose size is not known ahead (a creature, a portrait), shown at the largest **whole** multiple of its
 * art that fits the box, centred (`pixelFit`); a sprite bigger than the box is shrunk by a whole divisor. Hidden until
 * it has loaded and been measured, so it never flashes at the wrong size.
 */
export function PixelImage({ src, width, height, upscaled = 1, maxScale, alt = '', className }: PixelImageProps) {
  const cx = useCx();
  const [art, setArt] = useState<{ src: string; w: number; h: number } | null>(null);
  const size = art?.src === src ? pixelFit(art.w, art.h, width, height, maxScale) : null;
  return (
    <span className={cx(className ? `e1681-pixel-image ${className}` : 'e1681-pixel-image')} style={{ width, height }}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={size ? { width: size.width, height: size.height } : { visibility: 'hidden' }}
        onLoad={(e) => {
          const img = e.currentTarget;
          setArt({ src, w: img.naturalWidth / upscaled, h: img.naturalHeight / upscaled });
        }}
      />
    </span>
  );
}
