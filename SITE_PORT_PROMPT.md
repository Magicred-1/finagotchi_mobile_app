# Landing-design-to-app prompt — Finagotchi site look → Expo app onboarding

Paste everything below the line into a coding agent tasked with bringing the Finagotchi landing page's visual design into the mobile app. It assumes access to both repos; the key source files are referenced by path.

---

# Task: Apply the landing page's visual design to the mobile app, starting with the onboarding sign-up flow

## Context

Two sibling repos in the same parent directory:

- **Design source (read-only):** `finagotchi_landing_page/finagotchi/` — the Next.js marketing site. The design lives in `site/styles.css` (tokens, gradients, glass panels, typography) and the hero composition in `site/components/LandingPage.tsx` + `SiteShell.tsx` + `HeroDeviceLayer.tsx`.
- **Target (you edit this):** `finagotchi_mobile_app/finagotchi/` — the Expo app (expo-router, RN 0.81, React 19.1). The onboarding flow is `src/features/onboarding/` (`OnboardingFlow.tsx` orchestrates `SplashStep`, `AuthConsentStep` — the sign-up, `ConnectWalletStep`, `NameCreatureStep`, `HatchStep`, `MintStep`, `FirstCheckinStep`, `ReminderStep`, `FundWalletSheet`). Design tokens: `src/theme/tokens.ts`; conventions: `finagotchi_mobile_app/DESIGN.md`.

The goal is **not** to port site pages or content. It is to make the app *look like the landing page* — the same backgrounds, color story, glass, typography, and motion feel — beginning with onboarding, and applying the same design logic anywhere else the flow touches (sheets, dialogs, buttons, inputs).

## The design you are porting (extracted from `site/styles.css`)

1. **Signature background** (`.app-root`, line ~168): a full-bleed vertical gradient — `#0b2858` (navy) → `#123d77` at 30% → `#2668b8` at 55% → `#91bee9` at 83% → `#c2d9ef` (frost) at 100%. This replaces the app's dark `ScreenGradient` (`#252A30 → #11171E`) **on onboarding screens**.
2. **Soft glow** (`--page-soft-glow`): a radial blue ellipse (`#2668b8` at ~95% opacity fading to 0 by 72%) placed behind hero content and cards. Content pages add a rounded soft-glow wash behind the main panel.
3. **Text on the gradient**: headings `#f6faff`, secondary `#e0ebf8`, eyebrows uppercased with 1.2px tracking in `#b2d8f8`. Headlines are DM Sans **medium weight (500)**, never heavy bold, with tight negative letter-spacing (~-0.05em) — see `.hero-copy h1`.
4. **Glass panels**: translucent `#143766` fills (22–40% opacity, 66% when active) with 1px `#9dcbff30` borders and 16–24px radii (see `.faq-item`, `.popup-dialog`).
5. **Dialogs/sheets** (`.popup-dialog`): 24px radius, radial highlight `radial-gradient(ellipse at 85% 0%, #377bca70 → transparent 68%)` over a `155deg` navy→deep-blue→`#1d5592` linear gradient, deep soft shadow. Backdrop `#061d3d80`. Entrance: 240ms fade + 12px rise + 0.98→1 scale.
6. **Buttons**: primary is the light accent — background `#8dc9f6`, text `#102e55`, 10px radius; secondary is frosted light (`#f3f8ff` bg, `#173d6a` text, `#d9e9fb` border).
7. **Inputs** (waitlist form): light `#f3f8ff` surface, `#173d6a` text, `#d9e9fb` border, 10px radius, ~54px height — even on the dark blue chrome.
8. **Wordmark**: `finagotchi.` lowercase DM Sans 700, letter-spacing -1.3, accent-colored period (already implemented in the app via `BrandMark` + `SplashStep`).
9. **Hero motion**: staggered entrance and gentle idle float — the app's `SplashStep` already has the reanimated version of this feel; extend that pattern to the other steps.

## Read first (in this order)

1. `finagotchi_mobile_app/finagotchi/AGENTS.md` — directs you to the versioned Expo docs. Follow it before writing any code.
2. `finagotchi_landing_page/finagotchi/site/styles.css` — the whole file (555 lines); the sections above point at the key rules.
3. `finagotchi_landing_page/finagotchi/site/components/LandingPage.tsx` and `SiteShell.tsx` — hero composition and shell chrome.
4. `finagotchi_mobile_app/DESIGN.md`, `finagotchi_mobile_app/finagotchi/src/theme/tokens.ts` — current app tokens.
5. Every file in `finagotchi_mobile_app/finagotchi/src/features/onboarding/` plus `src/components/ScreenGradient.tsx`, `src/components/BrandMark.tsx`.

## Non-negotiables

1. **Every onboarding screen sits on the landing gradient** (item 1 above), with the soft-glow treatment behind primary content. The sign-up screen (`AuthConsentStep`) should feel like the landing hero: big medium-weight headline, accent primary button, frosted secondary, light inputs.
2. **Visuals only — logic is untouched.** Wallet connect (Dynamic), auth consent, minting, check-in, reminders, and step sequencing in `OnboardingFlow.tsx` behave exactly as before. You are re-skinning, not refactoring behavior.
3. **Extend the theme, don't fork it.** Add the landing palette to `src/theme/tokens.ts` as a clearly named addition (e.g. a `landing` / `onboarding` color group) with the exact hex values above, and add a gradient component (the repo's `GradientFill`/react-native-svg pattern per `DESIGN.md` — OTA-safe, no new native modules) that renders the 5-stop landing gradient. Do not hardcode hex values in step components.
4. **The whole flow must be coherent.** All onboarding steps and sheets get the same treatment — no screen left on the old dark theme mid-flow. Main app screens (`app/(tabs)/`) stay on the existing dark theme for now; the boundary is the end of onboarding.
5. **Motion via reanimated, honoring reduced motion** (`useReducedMotion`), matching the existing `SplashStep` pattern: staggered fade/rise entrances, gentle idle float, static poses when reduced motion is on.
6. **Update the docs.** `DESIGN.md` currently declares the dark near-black theme as the app identity. Revise it (and token comments) to describe the landing-blue onboarding identity and where each theme applies.

## Explicitly out of scope

- Site content pages (FAQ, docs, roadmap), waitlist, and marketing copy — not part of this task.
- The 3D device renders from the landing hero — do **not** attempt in this pass. If you want a hero visual, use the existing `BrandMark`/pet imagery.
- The `landing/` folder inside the mobile app repo — leave it alone.
- Any change to auth/wallet/mint logic, navigation structure, or analytics.

## Constraints

- Match the app's existing code style: feature-folder layout, `StyleSheet` + tokens, reanimated for animation, gesture-handler for touches, 44px touch targets, safe-area aware.
- pnpm; no new dependencies (react-native-svg and reanimated are already installed and sufficient).
- Keep accessibility contrast readable on the lighter gradient stops (bottom of the gradient approaches `#c2d9ef` — place light text on the darker upper region or use `#173d6a`-class ink where the background is light).

## Definition of done

1. `pnpm test` (vitest) passes in `finagotchi_mobile_app/finagotchi/`.
2. The app runs on a simulator/emulator and the full onboarding flow — splash → sign-up (`AuthConsentStep`) → connect wallet → name → hatch → mint → first check-in → reminder — renders on the landing blue gradient with glass panels, correct buttons/inputs, and staggered motion; reduced-motion OS setting yields static screens.
3. No behavioral regressions: wallet connect and mint still complete.
4. `DESIGN.md` and `src/theme/tokens.ts` updated to match what you built.
5. You report: tokens added, components touched, a screenshot of every onboarding step, and anything from the site design you intentionally did not translate (and why).
