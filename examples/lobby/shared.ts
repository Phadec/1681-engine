import type { MatchMode } from '../../src';

/* What the lobby server and its page agree on. */

export const PORT = 8092;

export const MODES: MatchMode[] = [
  { id: 'duel', teams: 2, teamSize: 1, window: 150, widenPerSecond: 25 },
  { id: '2v2', teams: 2, teamSize: 2, window: 150, widenPerSecond: 25 },
  { id: 'ffa', teams: 4, teamSize: 1, window: 300, widenPerSecond: 50 },
];

export interface PlayerInfo {
  name: string;
  rating: number;
}
