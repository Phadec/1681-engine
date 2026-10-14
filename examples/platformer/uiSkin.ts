import type { ButtonSkin, PanelSkin, SliderOptions } from '../../src/ui';
import type { TextStyle } from '../../src';

/*
 * The UI's look, in colour boxes: no art files. A game with art swaps these for 9-slice `TextureSkin`s and nothing
 * else changes.
 */
export const FONT: TextStyle = { fontFamily: 'monospace', fontSize: 16, color: '#efe6ff' };
export const SMALL: TextStyle = { fontFamily: 'monospace', fontSize: 13, color: '#bfb4d8' };
export const TITLE: TextStyle = { fontFamily: 'monospace', fontSize: 40, color: '#ffd98a', stroke: '#2a1838', strokeThickness: 6 };

export const WINDOW: PanelSkin = { color: 0x1c1628, border: 2, borderColor: 0x6a5a90, alpha: 0.96 };
export const HUD_BACK: PanelSkin = { color: 0x14101c, alpha: 0.7 };

export const BUTTON: ButtonSkin = {
  normal: { color: 0x2a2340, border: 2, borderColor: 0x5a4c80 },
  hover: { color: 0x3a3058, border: 2, borderColor: 0x8a78c0 },
  pressed: { color: 0x1c1830, border: 2, borderColor: 0x8a78c0 },
  // a bare ring over whichever face shows: no fill, only the border
  focus: { color: 0, fillAlpha: 0, border: 2, borderColor: 0xffd98a },
  pressOffset: 1,
};

export const SLIDER: Omit<SliderOptions, 'width' | 'height'> = {
  track: { color: 0x14101c, border: 1, borderColor: 0x5a4c80 },
  fill: { color: 0x5cc4b0 },
  knob: { color: 0xefe6ff, border: 1, borderColor: 0x2a2340 },
  // a ring round the track, drawn under the knob
  focus: { color: 0, fillAlpha: 0, border: 1, borderColor: 0xffd98a },
};
