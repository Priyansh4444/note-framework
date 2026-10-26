import {
  type Component,
  type JSX,
  type ParentComponent,
  For,
  Show,
  onCleanup,
  onMount,
} from "solid-js";
import { Tex } from "../components/ui/Tex";
import { tip } from "../post/scene/tooltip";
import { Wayfinder, type WayChapter } from "./Wayfinder";

/**
 * One manifest per note: its chapters (each a question and the takeaway that answers it),
 * its sources, and its glossary. Everything a reader uses to find their way (the route at
 * the top, each chapter's "so far" line, the corner map, hover reminders, the glossary,
 * the source list) renders from these, so none of it can drift out of date.
 */

/** Where a fact comes from: a lecture, a spec, a man page, a paper. */
export interface Source {
  title: string;
  url: string;
  /** Who stands behind it ("Linux kernel docs", "Lecture 3, slides 4–9"). */
  who?: string;
  /** Short inline label; defaults to `who`, then `title`. */
  short?: string;
  /** What this source is trusted for on this page. */
  why?: string;
}

export interface ChapterSpec<C extends string = string, S extends string = string> {
  id: C;
  title: string;
  /** The question the chapter answers, in the reader's words, before any jargon. */
  question: string;
  /** One sentence the reader can say after the chapter. The next chapter opens with it. */
  takeaway: string;
  /** Sources the chapter follows; shown beside its heading. */
  from?: readonly S[];
}

export interface Term<C extends string = string, S extends string = string> {
  name: string;
  /** Plain words first: one or two sentences, a tiny example if it helps. A thunk, so each use gets fresh DOM. */
  says: () => JSX.Element;
  /** How it is written, as TeX. */
  symbol?: string;
  /** The chapter that introduces it; omit for the reading key ("Before you start"). */
  home?: C;
  from?: S;
}

export interface NoteMeta {
  title: string;
  description: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Gives the page its own title and description while it is mounted. */
export function usePageHead(title: string, description: string) {
  onMount(() => {
    const previousTitle = document.title;
    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const meta = existing ?? document.createElement("meta");
    const previousContent = meta.content;
    document.title = title;
    meta.name = "description";
    meta.content = description;
    if (!existing) document.head.append(meta);
    onCleanup(() => {
      document.title = previousTitle;
      if (existing) meta.content = previousContent;
      else meta.remove();
    });
  });
}

export function defineNote<const C extends string, const S extends string = never>(spec: {
  /** Folder name; the page class is `note-<slug>`. */
  slug: string;
  chapters: readonly ChapterSpec<C, S>[];
  sources?: Record<S, Source>;
}) {
  const chapters = spec.chapters;
  const sources = (spec.sources ?? {}) as Record<S, Source>;
  const at = (id: C) => chapters.findIndex((c) => c.id === id);
  const number = (id: C) => pad(at(id) + 1);
  let terms: Record<string, Term<C, S>> = {};

  /** An inline "where this comes from" link. The tooltip says what the source is and why it is trusted here. */
  const Cite: ParentComponent<{ k: S }> = (props) => {
    const s = sources[props.k];
    return (
      <a
        class="nk-cite"
        href={s.url}
        target="_blank"
        rel="noreferrer"
        {...tip(() => (
          <span>
            <b>{s.title}</b>
            <Show when={s.who}>
              <span class="tip-line">{s.who}</span>
            </Show>
            <Show when={s.why}>
              <span class="tip-line dim">{s.why}</span>
            </Show>
          </span>
        ))}
      >
        {props.children ?? s.short ?? s.who ?? s.title}
        <span aria-hidden="true">↗</span>
      </a>
    );
  };

  /**
   * A chapter: where it sits in the route, where it comes from, what the reader already
   * knows (the previous takeaway), and the question it answers, all before the first paragraph.
   */
  const Chapter: ParentComponent<{ id: C }> = (props) => {
    const i = at(props.id);
    const c = chapters[i];
    const prev = chapters[i - 1];
    if (!c) throw new Error(`Unknown chapter "${props.id}". Add it to the note's chapters.`);
    return (
      <section id={c.id} class="nk-chapter" data-chapter={c.id}>
        {/* Close the last chapter before opening this one: a reader who jumps here still has the context. */}
        <Show when={prev}>
          <p class="nk-sofar">
            <a href={`#${prev!.id}`} class="nk-sofar-k">
              So far
            </a>
            <span>{prev!.takeaway}</span>
          </p>
        </Show>
        <header class="nk-chapter-head">
          <a
            class="nk-chapter-n"
            href={`#${c.id}`}
            aria-label={`Chapter ${i + 1} of ${chapters.length}: link to this chapter`}
          >
            {pad(i + 1)}
          </a>
          <h2>
            <a class="anchor" href={`#${c.id}`} aria-hidden="true">
              #
            </a>
            {c.title}
          </h2>
          <p class="nk-question">{c.question}</p>
          <Show when={c.from?.length}>
            <p class="nk-from">
              <span>Follows</span>
              <For each={c.from}>{(k) => <Cite k={k} />}</For>
            </p>
          </Show>
        </header>
        {props.children}
      </section>
    );
  };

  /**
   * An optional in-flow index: every chapter's question up front. Page already renders one outline,
   * so add this only when the note needs a full index; the outline stands down while it is visible.
   */
  const Contents: Component<{ label?: string }> = (props) => (
    <nav class="nk-contents" aria-label="Contents">
      <div class="label">{props.label ?? "The route"}</div>
      <ol>
        <For each={chapters}>
          {(c, i) => (
            <li>
              <a href={`#${c.id}`}>
                <span class="nk-contents-n">{pad(i() + 1)}</span>
                <span class="nk-contents-t">{c.title}</span>
                <span class="nk-contents-q">{c.question}</span>
              </a>
            </li>
          )}
        </For>
      </ol>
    </nav>
  );

  const TermTip: Component<{ term: Term<C, S> }> = (props) => (
    <span class="tip-term">
      <b>{props.term.name}</b>
      <Show when={props.term.symbol}>
        <span class="tip-symbol">
          <Tex tex={props.term.symbol!} />
        </span>
      </Show>
      <span class="tip-def">{props.term.says()}</span>
      <Show when={props.term.home}>
        <span class="tip-line nk-tip-home">
          introduced in {number(props.term.home!)} · {chapters[at(props.term.home!)].title}
        </span>
      </Show>
    </span>
  );

  /**
   * Register the glossary once. `T` wraps a word in the text (dotted, explained on hover,
   * focus or tap); the glossary section at the end renders from the same entries.
   */
  function glossary<const K extends string>(entries: Record<K, Term<C, S>>) {
    terms = entries;
    const T: ParentComponent<{ k: K }> = (props) => (
      <span class="term" tabIndex={0} {...tip(() => <TermTip term={entries[props.k]} />)}>
        {props.children ?? entries[props.k].name.toLowerCase()}
      </span>
    );
    return { T };
  }

  const groups = () => {
    const all = Object.values(terms) as Term<C, S>[];
    const basics = all.filter((t) => !t.home);
    return [
      ...(basics.length ? [{ title: "Before you start", items: basics }] : []),
      ...chapters
        .map((c, i) => ({
          title: `${pad(i + 1)} · ${c.title}`,
          items: all.filter((t) => t.home === c.id),
        }))
        .filter((g) => g.items.length),
    ];
  };

  const GlossarySection: Component = () => (
    <section id="glossary" class="nk-end">
      <h2>
        <a class="anchor" href="#glossary" aria-hidden="true">
          #
        </a>
        Glossary
      </h2>
      <p>Every reminder from the text, grouped by the chapter that introduces it.</p>
      <For each={groups()}>
        {(g) => (
          <>
            <h4 class="nk-glossary-group">{g.title}</h4>
            <dl class="nk-glossary">
              <For each={g.items}>
                {(t) => (
                  <>
                    <dt>
                      {t.name}
                      <Show when={t.symbol}>
                        <span class="nk-glossary-symbol">
                          <Tex tex={t.symbol!} />
                        </span>
                      </Show>
                    </dt>
                    <dd>
                      {t.says()}
                      <Show when={t.from}>
                        {" "}
                        <Cite k={t.from!} />
                      </Show>
                    </dd>
                  </>
                )}
              </For>
            </dl>
          </>
        )}
      </For>
    </section>
  );

  const SourcesSection: Component = () => (
    <section id="sources" class="nk-end">
      <h2>
        <a class="anchor" href="#sources" aria-hidden="true">
          #
        </a>
        Sources
      </h2>
      <ol class="nk-sources">
        <For each={Object.values(sources) as Source[]}>
          {(s) => (
            <li>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
              <Show when={s.who}>
                <span class="dim"> · {s.who}</span>
              </Show>
              <Show when={s.why}>
                <span class="nk-sources-why">{s.why}</span>
              </Show>
            </li>
          )}
        </For>
      </ol>
    </section>
  );

  const way: WayChapter[] = chapters.map((c, i) => ({
    id: c.id,
    n: pad(i + 1),
    title: c.title,
    question: c.question,
  }));

  /**
   * The page: header, a "how to read this" note, your content, then the glossary and
   * sources when the note has them, and the corner map that says where you are.
   */
  const Page: ParentComponent<{
    meta: NoteMeta;
    /** Shown above the title, e.g. "A first-principles companion". */
    kicker?: string;
    date: string;
    read?: string;
    dek: JSX.Element;
    /** Replace the default "how to read" note, or pass `false` to drop it. */
    howTo?: JSX.Element | false;
  }> = (props) => {
    usePageHead(props.meta.title, props.meta.description);
    const hasTerms = () => Object.keys(terms).length > 0;
    const hasSources = () => Object.keys(sources).length > 0;
    return (
      <main class={`nk-note note-${spec.slug}`}>
        <article>
          {/* One quiet entrance for the header; the body never waits on a timer. */}
          <header class="nk-head enter">
            <div class="meta">
              <Show when={props.kicker}>
                <span>{props.kicker}</span>
              </Show>
              <time dateTime={props.date}>
                {new Date(`${props.date}T12:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
              <Show when={props.read}>
                <span>{props.read}</span>
              </Show>
            </div>
            <h1>{props.meta.title}</h1>
            <p class="dek">{props.dek}</p>
          </header>
          {/* The page's one map: after the masthead on phones, in the margin on wide screens. */}
          <Wayfinder chapters={way} />
          <Show when={props.howTo !== false}>
            <aside class="note nk-howto">
              {props.howTo ?? (
                <>
                  <strong>How to read this page.</strong>{" "}
                  <Show when={hasTerms()}>
                    A{" "}
                    <span
                      class="term"
                      tabIndex={0}
                      {...tip(() => <span class="tip-def">Like this. Hover, focus, or tap.</span>)}
                    >
                      dotted word
                    </span>{" "}
                    explains itself, and the <a href="#glossary">glossary</a> collects them.{" "}
                  </Show>
                  <Show when={hasSources()}>
                    A <span class="nk-cite-demo">↗</span> link says where a fact comes from.{" "}
                  </Show>
                  Figures wait for you to press play; click a step under a figure to replay it. Each
                  chapter opens with what you know so far and the question it answers. If you get
                  lost, the page outline shows where you are, and ↩ takes you back after a jump.
                </>
              )}
            </aside>
          </Show>
          {props.children}
          <Show when={hasTerms()}>
            <GlossarySection />
          </Show>
          <Show when={hasSources()}>
            <SourcesSection />
          </Show>
        </article>
      </main>
    );
  };

  return { slug: spec.slug, chapters, sources, number, Page, Chapter, Contents, Cite, glossary };
}
