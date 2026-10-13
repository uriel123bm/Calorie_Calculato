---
name: premium-health-ui
description: >
  Reusable design and implementation guide for the AI Calorie Calculator
  premium UI. Ensures every new screen and component matches the product's
  Apple-quality visual identity: elegant, minimalist, RTL-ready, accessible,
  and mobile-first. Read this skill before touching any frontend UI file.
---

# Premium Health UI — Design & Implementation Skill

## 1. Mandatory First Steps

Before creating any new component or modifying an existing one:

1. **Search for an existing component** in `frontend/src/components/ui/` and the
   broader `frontend/src/components/` tree. Reuse or extend instead of creating
   a duplicate.
2. **Read `frontend/src/styles/App.css`** — understand the existing Design Tokens
   before adding new CSS variables.
3. **Check `frontend/src/App.tsx`** — understand the current tab structure and
   `AppShell` layout before introducing new navigation.

---

## 2. Design Philosophy

| Principle | In practice |
|---|---|
| Elegant | Generous whitespace, restrained color, strong typographic hierarchy |
| Minimalist | One primary action per screen; remove decorative noise |
| Intelligent | UI surfaces only the data the user needs right now |
| Premium | Refined shadows, glass surfaces, smooth transitions |
| Fast | No layout shift, instant feedback, optimistic updates |
| Consistent | Every screen uses the shared token system and component library |
| Inclusive | Full RTL (Hebrew), keyboard nav, visible focus, WCAG AA contrast |

---

## 3. Design Token System

All tokens live in `:root` inside `frontend/src/styles/App.css`. Dark-mode
variants are applied via `[data-theme="dark"]` (set by `useDarkMode`).

### 3.1 Core palette (already defined — do not redefine)

```css
--primary:         #0f5238
--primary-strong:  #2d6a4f
--primary-deep:    #063822
--primary-soft:    #e3f5e8
--primary-tint:    #b1f0ce
--leaf:            #5db876
--leaf-soft:       #d6efde
--success:         #1f8a4c
--warn:            #c47200
--danger:          #ba1a1a
```

### 3.2 Premium layer tokens (add to `:root` when needed)

```css
/* Depth / layering */
--surface-glass:        rgba(255,255,255,0.72);
--surface-glass-dark:   rgba(30,40,35,0.72);
--backdrop-blur:        blur(18px) saturate(160%);

/* Premium shadows */
--shadow-depth-1:  0 1px 2px rgba(0,0,0,.04), 0 2px 8px rgba(15,82,56,.06);
--shadow-depth-2:  0 4px 12px rgba(0,0,0,.08), 0 8px 28px rgba(15,82,56,.10);
--shadow-depth-3:  0 8px 24px rgba(0,0,0,.12), 0 20px 48px rgba(15,82,56,.14);
--shadow-glow-primary: 0 0 0 3px rgba(15,82,56,.20);

/* Gradient accents */
--gradient-primary:  linear-gradient(135deg, #0f5238 0%, #2d6a4f 100%);
--gradient-leaf:     linear-gradient(135deg, #5db876 0%, #2d6a4f 100%);
--gradient-warm:     linear-gradient(135deg, #845519 0%, #c47200 100%);
--gradient-surface:  linear-gradient(180deg, rgba(255,255,255,.9) 0%, rgba(248,249,250,.95) 100%);

/* Motion */
--ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-smooth:     cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-enter:      cubic-bezier(0.0, 0.0, 0.2, 1);
--ease-exit:       cubic-bezier(0.4, 0.0, 1, 1);
--duration-fast:   150ms;
--duration-base:   250ms;
--duration-slow:   400ms;

/* Coach-specific accent */
--coach-accent:    #1a56db;
--coach-soft:      #e8f0fe;
--coach-strong:    #1239a6;
```

---

## 4. Typography System

Fonts are loaded via Google Fonts in `frontend/index.html`.

| Role | Variable | Font |
|---|---|---|
| Body | `--font-body` | Lexend, Heebo, system-ui |
| Headings | `--font-head` | Plus Jakarta Sans, Heebo, system-ui |

### Typographic scale

```css
.text-xs   { font-size: 11px; line-height: 1.5; }
.text-sm   { font-size: 13px; line-height: 1.5; }
.text-base { font-size: 15px; line-height: 1.55; }
.text-lg   { font-size: 17px; line-height: 1.4; }
.text-xl   { font-size: 20px; line-height: 1.35; letter-spacing: -.01em; }
.text-2xl  { font-size: 24px; line-height: 1.25; letter-spacing: -.02em; }
.text-3xl  { font-size: 30px; line-height: 1.2;  letter-spacing: -.02em; }
```

Always use `font-family: var(--font-head)` for display headings,
`var(--font-body)` for everything else.

---

## 5. Component Patterns

### 5.1 PremiumCard

A glass-morphism card that elevates on hover.

```tsx
// frontend/src/components/ui/PremiumCard.tsx
<div className="premium-card">
  {children}
</div>
```

```css
.premium-card {
  background: var(--surface-card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-depth-1);
  padding: 20px;
  transition: box-shadow var(--duration-base) var(--ease-smooth),
              transform var(--duration-base) var(--ease-smooth);
}
.premium-card:hover {
  box-shadow: var(--shadow-depth-2);
  transform: translateY(-1px);
}
```

### 5.2 StatCard

Metric display with an icon, value, label, and optional trend.

```tsx
<StatCard icon="local_fire_department" value={2100} label="קלוריות היום" trend="+120" />
```

### 5.3 AnimatedProgressRing

SVG ring with animated stroke-dashoffset on mount. Respects
`prefers-reduced-motion` by disabling the animation.

```tsx
<AnimatedProgressRing value={75} max={100} color="var(--primary)" size={80} />
```

### 5.4 EmptyState

Consistent empty-state pattern for lists and dashboards.

```tsx
<EmptyState icon="search_off" title="אין נתונים" message="הוסף את הפריט הראשון שלך" />
```

### 5.5 LoadingSkeleton

Shimmer-animated placeholder. Match the shape of the real content.

```tsx
<LoadingSkeleton width="100%" height={60} borderRadius={12} />
```

### 5.6 StatusBadge

Pill-shaped badge for invitation statuses.

```tsx
<StatusBadge status="pending" />   // → "ממתין"
<StatusBadge status="accepted" />  // → "אושר"
<StatusBadge status="rejected" />  // → "נדחה"
```

---

## 6. Motion & Micro-interactions

### Rules

1. **Always honour `prefers-reduced-motion`:**
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
   }
   ```
2. Use CSS transitions for hover/focus states (≤ 250 ms).
3. Use CSS `@keyframes` for entrance animations (< 400 ms).
4. Reserve JavaScript animation (if justified) for complex sequences only;
   prefer CSS keyframes first.

### Standard entrance keyframe

```css
@keyframes slide-up-fade {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-enter {
  animation: slide-up-fade var(--duration-base) var(--ease-spring) both;
}
```

### Progress ring keyframe

```css
@keyframes ring-fill {
  from { stroke-dashoffset: var(--ring-full); }
  to   { stroke-dashoffset: var(--ring-target); }
}
```

### Shimmer skeleton

```css
@keyframes shimmer {
  from { background-position: -400px 0; }
  to   { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--surface-low) 25%, var(--surface-alt) 50%, var(--surface-low) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.5s infinite linear;
}
```

---

## 7. RTL & Internationalisation

- The app's `<html>` has `dir="rtl"`. Never set `direction: ltr` unless deliberately creating an LTR island.
- Use **logical CSS properties** (`margin-inline-start`, `padding-inline-end`) instead of `margin-left/right`.
- Icon buttons must have `aria-label` in Hebrew.
- Number formatting: use `toLocaleString('he-IL')` for calories / macros.
- Date formatting: use `Intl.DateTimeFormat('he-IL', {...})`.

---

## 8. Accessibility Checklist

Before committing any new UI:

- [ ] Colour contrast ≥ 4.5:1 for text (WCAG AA)
- [ ] Interactive elements have visible focus ring (`:focus-visible`)
- [ ] All images / icon buttons have `aria-label` or `alt`
- [ ] Form fields have associated `<label>` or `aria-label`
- [ ] Error messages are associated with inputs via `aria-describedby`
- [ ] Loading state announced via `aria-busy` or `aria-live`
- [ ] Motion disabled when `prefers-reduced-motion: reduce`

---

## 9. Responsive Layout

| Breakpoint | Target |
|---|---|
| < 480 px | Mobile portrait (iPhone SE) |
| 480–768 px | Mobile landscape / small tablet |
| 768–1024 px | Tablet |
| > 1024 px | Desktop |

- Mobile-first: write base styles for small screens, enhance with `min-width` media queries.
- Bottom nav height reserved via `padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom))`.
- Never cause horizontal scroll. Test with DevTools at 375 px width.

---

## 10. Dark Mode

- Tokens for dark mode live in `[data-theme="dark"]` in `App.css`.
- Always define both light and dark values for any new custom property.
- Test in both themes before shipping.

---

## 11. Coach Feature Design

The coaching system uses the `--coach-accent` (#1a56db / blue) palette to
visually distinguish coach-specific UI from the user's personal health data
(green palette). This prevents cognitive confusion between the two contexts.

- Coach dashboard: blue accent cards, `--coach-soft` backgrounds
- Invitation badges: `StatusBadge` component
- Trainee cards: `PremiumCard` with avatar placeholder, nutrition mini-summary
- Data access warning: always show a consent banner when viewing trainee data

---

## 12. Quality Checklist (run before every PR)

- [ ] `npm run build` passes with 0 TypeScript errors
- [ ] `npx vitest run` — all tests pass
- [ ] No `console.error` in browser DevTools on any screen
- [ ] Mobile layout tested at 375 px (Chrome DevTools)
- [ ] Desktop layout tested at 1280 px
- [ ] RTL: text, icons, and layout all flow right-to-left correctly
- [ ] Dark mode: all surfaces readable, no clipped text
- [ ] Empty states: every list has a meaningful empty state
- [ ] Loading states: every async operation shows a skeleton or spinner
- [ ] Error states: every async operation handles failure visibly
- [ ] `prefers-reduced-motion: reduce` disables all animations
