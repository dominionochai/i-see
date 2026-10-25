/**
 * Class recipes for the app's chunky look: thick ink borders, hard offset
 * shadows and rounded corners. Colours come from the theme tokens in globals.css.
 */
const BORDER = "border-[3px] border-[var(--ink)]";

export const brutal = {
  panel: "fixed inset-0 z-[850] flex flex-col bg-[var(--iris-bg)] text-[var(--ink)]",
  header: "flex flex-wrap items-center gap-3 border-b-4 border-[var(--ink)] bg-white px-5 py-3 shadow-[0_4px_0_var(--ink)]",
  title: "text-2xl font-black uppercase tracking-tight",
  subtitle: "hidden text-sm font-semibold text-[var(--iris-text-secondary)] sm:block",
  card: `rounded-2xl ${BORDER} bg-white p-4 shadow-[4px_4px_0_var(--ink)]`,
  button: `min-h-12 rounded-xl ${BORDER} bg-white px-4 py-2 text-sm font-bold text-[var(--ink)] shadow-[0_4px_0_var(--ink)] transition-transform active:translate-y-1 active:shadow-none disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none`,
  buttonActive: "!bg-[var(--cat-yes)]",
  buttonPrimary: `min-h-12 rounded-xl ${BORDER} bg-[var(--btn-purple)] px-5 py-2 text-sm font-black text-white shadow-[0_4px_0_var(--ink)] transition-transform active:translate-y-1 active:shadow-none disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none`,
  chip: `rounded-full ${BORDER} bg-white px-4 py-2 text-sm font-bold text-[var(--ink)] shadow-[0_3px_0_var(--ink)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-40 disabled:shadow-none`,
  field: `w-full resize-none rounded-xl ${BORDER} bg-white px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--iris-text-muted)] focus:outline-none focus:ring-4 focus:ring-[var(--btn-purple)]/40`,
  label: "text-[11px] font-black uppercase tracking-[0.18em] text-[var(--iris-text-secondary)]",
  muted: "text-[var(--iris-text-secondary)]",
} as const;
