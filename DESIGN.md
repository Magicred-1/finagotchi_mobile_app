# Design

The mobile app follows the finagotchi landing identity (shared by
`finagotchi_landing_page` site/styles.css and finagotchiFE), translated to
React Native. The source of truth for tokens is
`finagotchi/src/theme/tokens.ts`.

**The landing-blue identity is app-wide.** Every screen — onboarding
(`src/features/onboarding/`), the main pet screen (`app/(tabs)/`), hardware
binding, and all sheets/overlays — sits on the marketing site's signature
5-stop vertical gradient with its glass panels, frosted controls, and
medium-weight headlines. The earlier near-black dark theme survives only as
legacy `colors.*` tokens still referenced inside some sheet contents and as
the `'dark'` fallback tone on shared components; new work uses `landing.*`.

## Visual Theme (landing blue)

Every screen renders `ScreenGradient` (absolute fill, behind content): the
site `.app-root` background, `#0B2858` → `#123D77` 30% → `#2668B8` 55% →
`#91BEE9` 83% → `#C2D9EF`, plus a `SoftGlow` — the site `--page-soft-glow`
radial blue ellipse — behind the primary content area. Both are
react-native-svg (OTA-safe), like `GradientFill`. (`LandingGradient` is a
thin alias kept for the onboarding flow's call sites; use `ScreenGradient`
in new code.)

| Token (`landing.*`) | Value | Usage |
|---------------------|-------|-------|
| `navy` / `deepBlue` / `blue` / `lightBlue` / `frost` | `#0B2858` `#123D77` `#2668B8` `#91BEE9` `#C2D9EF` | Gradient stops (`gradients.landing`) |
| `text` | `#F6FAFF` | Headlines, high-emphasis text |
| `textMuted` | `#E0EBF8` | Body copy on the gradient |
| `eyebrow` | `#B2D8F8` | Uppercase micro-labels (+1.2 tracking) |
| `glass` / `glassActive` | `#14376638` / `#14376666` | Glass panel fills (Active = enough navy to keep light text readable over the light lower gradient stops) |
| `glassBorder` / `glassBorderStrong` | `#9DCBFF30` / `#9DCBFF50` | 1 px glass borders |
| `accent` / `accentPressed` | `#8DC9F6` / `#B6DCF9` | Primary buttons, highlights |
| `onAccent` | `#102E55` | Text/icons on the accent |
| `frostSurface` / `frostBorder` | `#F3F8FF` / `#D9E9FB` | Frosted secondary buttons, light inputs |
| `ink` / `inkMuted` | `#173D6A` / `#4D6C91` | Text on light surfaces and the light lower gradient stops |
| `placeholder` | `#7087A3` | Input placeholders on frost surfaces |
| `backdrop` | `#061D3D80` | Dialog/sheet backdrop |
| `dialogHighlight` | `#377BCA` | Radial highlight on dialog surfaces |
| `dialogDeep` | `#1D5592` | Deepest stop of `gradients.landingDialog` |
| `error` | `#FFC9C9` | Error text on dark blue |

Rules of thumb:

- Headlines are DM Sans **medium (500)**, never heavy bold, with tight
  negative tracking (`tracking.title` / `tracking.heading` ≈ -0.045em).
- Panels are glass: `landing.glass` fill + 1 px `landing.glassBorder`,
  16–24 px radii. Panels that reach into the light lower third of the
  gradient (the home screen's main card, the streak row) use
  `landing.glassActive` so light text on them keeps AA contrast.
- Buttons: primary = accent bg / `#102E55` text; secondary = frosted
  (`frostSurface` bg, `frostBorder`, `ink` text). `Button`/`IconButton`/
  `BottomSheet` default to `tone="landing"` app-wide; `'dark'` remains only
  as a legacy fallback.
- Inputs are light even on the dark blue chrome: `frostSurface` bg,
  `ink` text, `frostBorder`, 54 px height, 10 px radius.
- Contrast: the bottom of the gradient approaches `#C2D9EF`. Keep light
  text (`text`/`textMuted`) on the darker upper/mid region or on
  navy/glass surfaces; use `ink`/`inkMuted` for text pinned near the bottom
  (e.g. the splash hint) and on frost surfaces (bottom tab bar, social
  buttons).
- Sheets/dialogs use the landing dialog surface (site `.popup-dialog`):
  `gradients.landingDialog` (navy → deepBlue → `#1D5592`) with a radial
  `dialogHighlight` glow at the top right and a `glassBorderStrong` edge.
  `BottomSheet` renders this by default.
- Motion: staggered fade/rise entrances via the `FadeInUp` component
  (240–480 ms, ease-out, small scale-up), gentle idle float on the splash
  mark — all honoring `useReducedMotion` (static poses when on).

## Home Screen Composition

The main pet screen (`app/(tabs)/index.tsx`) layers, top to bottom: top bar
(ghost glyph left; Bluetooth button + streak pill + points pill as landing
glass pills right) → one strong `glassActive` main card (name/level/XP/
happiness header, dominant portrait panel with the feed + mood status
cluster, stage progress band, and the Actions entry button) → streak week
row → League/Leaderboard buttons → DCA promo card → action bar.

- **Header status pills**: streak (flame + count, opens the streak sheet)
  and points (diamond + balance) sit in the top bar as glass pills next to
  the Bluetooth button — not scattered on the card.
- **Actions dialog**: the four pet actions (Caress/Treat/Play/Train, same
  handlers and cost badges as the old dock) live in `ActionsDialog` — a
  centered landing dialog (`.popup-dialog` recipe: `landingDialog`
  gradient, `dialogHighlight` glow, glass border) with a bubbly entrance:
  card springs from 0.8 scale (`damping 11, stiffness 180`) and the action
  buttons pop in staggered (`damping 10, stiffness 220`, 55 ms steps); the
  exit is a quick 140 ms fade + scale-down; reduced motion gets a plain
  fade. A short pop SFX (`assets/pop.wav` via `src/lib/sfx.ts`) plays on
  open and softer on action taps; SFX fails silently when the expo-audio
  native module is missing (older installs receiving OTA JS). The home
  entry point is a compact glass "Actions" pill where the old dock header
  was. The dialog renders through the SheetPortal, never RN Modal, so
  Dynamic's WebView can still draw above it.
- **Status cluster**: feed (apple) and mood (heart) live in a single glass
  pill at the portrait's top-right corner — never as icons scattered down
  the card edge.
- **Stage progress band**: `PetStageProgress` (exported from `PetCanvas`)
  with its label row ("Hatching · 0/2 to next") plus the life-timer
  countdown are anchored to the bottom of the portrait panel, over the
  ground tint — there is no separate stage card. `PetCanvas` is rendered
  with `showChrome={false}` so the dots never overlap the pet.
- **Portrait panel**: the `gradients.portrait` panel with a 1 px glass
  border and the `landing.navy` pet circle — the amber pet (`#F8B43C`)
  pops on the navy. The panel is the dominant element of the card.
- **Action bar**: a `glassActive` pill bar with glass icon buttons
  (collectibles, hardware, quests, games) flanking the big accent
  **Check in** CTA. The CTA reuses the existing unified check-in flow:
  spin the wheel if a spin is claimable, otherwise open the food sheet
  (first feed of the day = check-in), otherwise a free caress.

## Legacy Dark Palette (`colors.*`)

The original "glass on near-black blue" scheme (deep blue-slate gradient
`#252A30` → `#11171E`, translucent white-on-dark panels) is no longer the
app identity. These tokens remain for sheet contents not yet migrated and
for semantic accents that work on any background (`amber`/`gold`/`heart`/
`success`). Don't use the dark surface tokens (`background`, `surface`,
`surfaceLight`, `panel`, `chip`, `panelAlt`) on screens — use `landing.*`
glass instead.

| Token | Value | Usage |
|-------|-------|-------|
| `colors.background` | `#11171E` | Root background (gradient bottom) |
| `colors.backgroundTop` | `#252A30` | Gradient top |
| `colors.surface` | `#141B24` | Cards, sheets, raised surfaces |
| `colors.surfaceLight` | `#1A2028` | Controls, inputs, action buttons |
| `colors.surfaceHover` | `#232B36` | Active/hover surfaces |
| `colors.panel` | `#10151B` | Deepest panels (actions dock) |
| `colors.panelAlt` | `#364359` | Alternate panel (stage card) |
| `colors.chip` | `#10161C` | Stat pills, chips |
| `colors.primary` | `#8DC9F6` | Signature accent, CTAs, highlights |
| `colors.primaryDark` | `#B6DCF9` | Pressed/active primary |
| `colors.onPrimary` | `#102E55` | Text/icons on the accent color |
| `colors.amber` | `#F8B43C` | Reward, magic, evolution moments |
| `colors.gold` | `#E9B846` | Points, currency, warnings |
| `colors.heart` | `#F36F7C` | Errors, destructive actions, hearts |
| `colors.text` | `#D7E0EE` | Primary text |
| `colors.textStrong` | `#F6FAFF` | Headings, high-emphasis text |
| `colors.textMuted` | `#9CA9BB` | Secondary text, labels |
| `colors.danger` | `#F36F7C` | Alias of heart |
| `colors.warning` | `#E9B846` | Alias of gold |
| `colors.success` | `#7ED6A7` | Positive change, success states |
| `colors.border` | `rgba(255,255,255,0.10)` | "Glass" 1 px borders |
| `colors.borderSoft` | `rgba(255,255,255,0.05)` | Subtle fills/borders |
| `colors.streakPill` | `#142A34` | Streak pill background |
| `colors.badgeFree` | `#254859` | "Free" cost badges |
| `colors.badgeCost` | `#242C37` | Point-cost badges |

Deprecated aliases: `colors.cyan` → primary, `colors.purple` → amber. Do not
use them in new code.

Gradients (`gradients`): `landing` (5-stop app-wide background,
ScreenGradient component), `landingDialog` (sheet/dialog surfaces),
`portrait` `#263E49`→`#2C3042` (pet portrait panel), plus legacy
`screen`/`sheet` dark gradients kept for reference. Render with the
`GradientFill` component (react-native-svg based — OTA-safe, no native
module); multi-stop gradients pass `gradientStops.*` as `locations`.

## Brand

- **Logo mark**: the flower glyph (blue rounded square `#2466DB`, white
  flower, blue center dot) — the site favicon and header brand symbol. In-app
  it is rendered by the `BrandMark` component.
- **Mascot**: the cyan ghost ("Finny") — the pet itself, used for the header
  glyph, hardware imagery, and social assets.
- **App icon**: the `BrandMark` flower glyph (accent `#8DC9F6` outline,
  faint fill, solid center dot) on landing navy `#0B2858` — the icon set
  (`assets/icon.png`, `splash-icon.png`, `favicon.png`, `android-icon-*.png`)
  renders the exact `BrandMark` SVG recipe; adaptive/splash
  `backgroundColor` in `app.json` match the navy.
- **Wordmark**: `finagotchi.` lowercase, DM Sans 700, letter-spacing -1.3,
  with the period in the accent color.

## Typography

Font family: **DM Sans** (Google Fonts), loaded via
`@expo-google-fonts/dm-sans` in `app/_layout.tsx`. Family names are exposed
as `fonts.regular/medium/semiBold/bold/extraBold/black`.

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `typography.title` | 32 | 500 | Screen titles |
| `typography.heading` | 22 | 500 | Section headings |
| `typography.body` | 16 | 400 | Body copy |
| `typography.small` | 13 | 500 | Labels, captions |
| `typography.micro` | 11 | 500 | Uppercase eyebrows, badges |

Headings are medium weight (500), never heavy bold; bold is reserved for the
wordmark, numbers, and badges. Tracking: headings pulled tighter (negative),
uppercase micro-labels at +1.2 (`tracking.eyebrow`) — see the `SectionLabel`
component.

## Spacing Scale

| Token | Value |
|-------|-------|
| `spacing.xs` | 4 |
| `spacing.sm` | 8 |
| `spacing.md` | 16 |
| `spacing.lg` | 24 |
| `spacing.xl` | 32 |

## Radii

| Token | Value |
|-------|-------|
| `radius.sm` | 10 |
| `radius.md` | 16 |
| `radius.lg` | 24 |
| `radius.xl` | 29 |
| `radius.pill` | 999 |

## Motion

Springs are defined by Reanimated mass/stiffness/damping with `mass: 1`.

| Token | Damping | Stiffness | Use |
|-------|---------|-----------|-----|
| `springs.default` | 35 | 280 | Smooth UI transitions |
| `springs.snappy` | 38 | 420 | Buttons, small controls |
| `springs.momentum` | 18 | 280 | Gestures, sheets, swipes |
| `springs.gentle` | 40 | 180 | Reduced-motion alternatives |

Press feedback:
- `press.scaleDown`: 0.97
- `press.opacityDown`: 0.85
- `press.spring`: `springs.snappy`

Durations (`durations`): press 160 ms, dialog 240 ms, backdrop 300 ms,
breathing glow 5500 ms. Easing preference: exponential ease-out. No bounce
or elastic.

## Components

- **PressableScale**: Primary interactive primitive. Scales down on press and springs back.
- **Button**: `primary` (accent bg, `#102E55` uppercase text) and `secondary` variants;
  `tone` defaults to `'landing'` app-wide (frosted secondary); `'dark'` is
  the legacy near-black glass look.
- **IconButton**: 56×56 rounded (23 px) control with a label; `tone` as above
  (landing = frosted surface, ink label).
- **ScreenGradient**: Full-screen app background — the 5-stop landing
  gradient plus a `SoftGlow` behind the primary content.
- **LandingGradient**: Thin alias of ScreenGradient kept for onboarding call
  sites; use ScreenGradient in new code.
- **SoftGlow**: Radial blue ellipse (site `--page-soft-glow`) for glows behind
  content and the radial highlight on landing dialogs.
- **GradientFill**: Vertical gradient fill; 2+ stops via `colors` +
  `locations`, custom direction via `start`/`end`.
- **FadeInUp**: Staggered fade/rise entrance for onboarding content blocks
  (reanimated, reduced-motion aware), in `src/features/onboarding/`.
- **ActionsDialog**: Centered landing dialog for the pet actions — bubbly
  spring entrance, staggered button pop-in, pop SFX (`src/lib/sfx.ts`),
  SheetPortal-based, reduced-motion fade fallback.
- **SectionLabel**: Uppercase micro-label (11 px, medium, +1.2 tracking);
  pass `color={landing.eyebrow}` on the blue chrome.
- **BrandMark**: The flower/teardrop/star/triangle brand glyphs (flower = wordmark mark).
- **PetCanvas**: Creature rendering with mood/reaction states; `showChrome`
  toggles its in-canvas stage dots + life timer, and `PetStageProgress` is
  exported for placing the dots in a screen's own layout. The creature
  engine (`src/engine/*`) is a cross-platform source of truth shared with the
  firmware and landing page — its colors are frozen and not part of this
  palette.
- **BottomSheet**: Modal-like panel for collectibles, quests, etc.; renders
  the landing dialog surface by default (`tone="landing"`).

## Layout Conventions

- Content uses edge-to-edge screens with safe-area insets.
- Backgrounds: `ScreenGradient` everywhere — every screen and its sheets sit
  on the landing gradient.
- Surfaces are "glass": `landing.glass` fills with 1 px
  `landing.glassBorder` borders; `landing.glassActive` where a panel sits
  over the light lower gradient stops. Frosted (`frostSurface`) for
  bottom-region controls (tab bar, social buttons, secondary buttons).
- Avoid nested cards; keep hierarchy through surface depth and spacing.
- Touch targets minimum 44×44 pt.

## Accessibility

- Honor `prefers-reduced-motion`.
- Maintain WCAG AA contrast for text.
- Use clear icon + label pairings for actions.
