import { formatMessage, sourceText } from './formatMessage';

/** A translation that changes with a count, by the plural categories of the language (`one`, `few`, `many`, `other`…). */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

/** A language's translations, keyed by the English source (with its `|context`, if any). */
export type Catalog = Readonly<Record<string, string | PluralForms>>;

export interface TranslatorOptions {
  /** The language strings are written in (default 'en'): shown as written, never reported missing. */
  source?: string;
  /** The language to start in (default the source). */
  language?: string;
  /** Told once per key and language of every string with no translation, for tooling or a log. */
  onMissing?: (key: string, language: string) => void;
}

/**
 * Translation with the English source as the key: `tr('Open the gate')` shows the English until a catalog for the
 * current language has a line for it, so writing a new string never breaks the game, it only shows untranslated.
 *
 * - Placeholders are positional: `tr('{0} joined', name)`.
 * - The same English with two meanings gets a context after `|`: `tr('Close|window')`, `tr('Close|near')`. The
 *   context is a separate key for translators and never shown.
 * - Counts: `trn('{0} coin', '{0} coins', n)` picks a form by `Intl.PluralRules`; the key is the plural form, and
 *   a catalog may give every category its language has (`{ one, few, many, other }`). `{0}` is the count.
 * - `setLanguage` switches at once and tells subscribers, so a UI re-renders instead of reloading: read labels when
 *   they are shown, never once at import.
 *
 * `tr` and `trn` are bound, so they can be handed around (`const { tr } = translator`).
 */
export class Translator {
  readonly source: string;
  private lang: string;
  private readonly catalogs = new Map<string, Catalog>();
  private readonly listeners = new Set<(language: string) => void>();
  private readonly rules = new Map<string, Intl.PluralRules>();
  private readonly reported = new Set<string>();
  private readonly onMissing: ((key: string, language: string) => void) | undefined;

  constructor(options: TranslatorOptions = {}) {
    this.source = options.source ?? 'en';
    this.lang = options.language ?? this.source;
    this.onMissing = options.onMissing;
  }

  get language(): string {
    return this.lang;
  }

  /** Languages with a catalog, plus the source. */
  get languages(): string[] {
    return [...new Set([this.source, ...this.catalogs.keys()])];
  }

  /** Adds (or merges into) a language's catalog; subscribers hear of it when it is the language shown. */
  addCatalog(language: string, catalog: Catalog): void {
    const had = this.catalogs.get(language);
    this.catalogs.set(language, had ? { ...had, ...catalog } : catalog);
    if (language === this.lang) this.notify();
  }

  setLanguage(language: string): void {
    if (language === this.lang) return;
    this.lang = language;
    this.notify();
  }

  /** Calls `fn` with the language after every switch; the returned function stops it. */
  subscribe(fn: (language: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Whether the current language has its own line for `key`. */
  has(key: string): boolean {
    return this.catalogs.get(this.lang)?.[key] !== undefined;
  }

  readonly tr = (key: string, ...args: unknown[]): string => {
    const entry = this.lookup(key);
    let text: string;
    if (entry === undefined) text = sourceText(key);
    else if (typeof entry === 'string') text = entry;
    else text = entry.other ?? sourceText(key);
    return formatMessage(text, args);
  };

  readonly trn = (one: string, other: string, count: number, ...args: unknown[]): string => {
    const entry = this.lookup(other);
    const all = [count, ...args];
    if (entry === undefined) return formatMessage(sourceText(this.category(this.source, count) === 'one' ? one : other), all);
    if (typeof entry === 'string') return formatMessage(entry, all);
    const text = entry[this.category(this.lang, count)] ?? entry.other ?? sourceText(other);
    return formatMessage(text, all);
  };

  private lookup(key: string): string | PluralForms | undefined {
    const entry = this.catalogs.get(this.lang)?.[key];
    if (entry === undefined && this.lang !== this.source && this.onMissing) {
      const id = `${this.lang}\u0000${key}`;
      if (!this.reported.has(id)) {
        this.reported.add(id);
        this.onMissing(key, this.lang);
      }
    }
    return entry;
  }

  private category(language: string, count: number): Intl.LDMLPluralRule {
    let r = this.rules.get(language);
    if (!r) {
      r = new Intl.PluralRules(language);
      this.rules.set(language, r);
    }
    return r.select(count);
  }

  private notify(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(this.lang);
      } catch (err) {
        console.error('[i18n] a language listener failed', err);
      }
    }
  }
}
