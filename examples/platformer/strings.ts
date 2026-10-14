import { Translator, type Catalog } from '../../src';

/*
 * Every string on screen is written in English in the code and looked up through `tr`, so the English *is* the key:
 * a new line shows untranslated rather than breaking. The second language is French, kept here as one catalog; a
 * real game keeps catalogs in JSON and finds the keys with `extractStrings`.
 */
const FRENCH: Catalog = {
  'Coins {0}/{1}': 'Pièces {0}/{1}',
  'Time {0}': 'Temps {0}',
  Paused: 'Pause',
  Resume: 'Reprendre',
  Restart: 'Recommencer',
  'Language: {0}': 'Langue : {0}',
  'Volume|sound': 'Volume',
  'Jump key: {0}': 'Touche de saut : {0}',
  'Press a key… (Esc cancels)': 'Appuyez sur une touche… (Échap annule)',
  'That key was taken from: {0}': 'Touche reprise à : {0}',
  'Escape, Enter and Tab are kept for menus': 'Échap, Entrée et Tab restent aux menus',
  'Start|game': 'Jouer',
  'Best time: {0}': 'Meilleur temps : {0}',
  'No best time yet': 'Pas encore de record',
  'Level clear! {0}': 'Niveau terminé ! {0}',
  'Arrows / WASD to run · {0} to jump · Down + jump drops through planks': 'Flèches / WASD pour courir · {0} pour sauter · Bas + saut traverse les planches',
  'Esc pauses · F3 shows the physics': 'Échap met en pause · F3 montre la physique',
  // a plural: the key is the English "other" form, and French gives the forms its own rules ask for
  '{0} coins collected in all': { one: '{0} pièce ramassée en tout', other: '{0} pièces ramassées en tout' },
  // action names, as the rebind hint names them
  'left|action': 'gauche',
  'right|action': 'droite',
  'down|action': 'bas',
  'jump|action': 'saut',
  'pause|action': 'pause',
};

/** Each language named in itself: a player looking for their own language must be able to read its name. */
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: 'English', fr: 'Français' };

export function createTranslator(language: string): Translator {
  const t = new Translator({ source: 'en', onMissing: (key, lang) => console.warn(`[i18n] no ${lang} for "${key}"`) });
  t.addCatalog('fr', FRENCH);
  t.setLanguage(t.languages.includes(language) ? language : 'en');
  return t;
}
