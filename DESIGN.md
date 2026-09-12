# Design

## Visual Theme

A dark, handheld-toy interface for a mobile Solana creature-raising app. The surface sits in deep navy with layered panels, using a single bright cyan accent for energy and a secondary purple for moments of magic or reward. The mood is crisp, retro-futuristic, and tactile — like a premium LCD toy from the near future.

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `colors.background` | `#07111F` | Root background |
| `colors.surface` | `#0E1B2E` | Cards, sheets, raised surfaces |
| `colors.surfaceLight` | `#162640` | Hover/pressed surface states |
| `colors.primary` | `#35D7FF` | Primary accent, CTAs, highlights |
| `colors.primaryDark` | `#16caf7` | Pressed/active primary |
| `colors.cyan` | `#35D7FF` | Alias for primary cyan |
| `colors.purple` | `#9945FF` | Reward, magic, evolution moments |
| `colors.text` | `#FFFFFF` | Primary text |
| `colors.textMuted` | `#8FA2B8` | Secondary text, labels |
| `colors.danger` | `#FF647C` | Errors, destructive actions |
| `colors.warning` | `#FFD166` | Warnings, points, currency |
| `colors.success` | `#5DE2A6` | Positive change, success states |
| `colors.border` | `#243651` | Subtle borders and dividers |

Neutrals are tinted toward the cyan/blue hue rather than pure gray.

## Typography

Font family: **Poppins** (Google Fonts), loaded via `@expo-google-fonts/poppins`.

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `typography.title` | 32 | 800 | Screen titles |
| `typography.heading` | 22 | 700 | Section headings |
| `typography.body` | 16 | 400 | Body copy |
| `typography.small` | 13 | 500 | Labels, captions |

Tracking is tuned by size: titles pulled tighter, small text slightly looser.

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
| `radius.sm` | 8 |
| `radius.md` | 14 |
| `radius.lg` | 22 |
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

Easing preference: exponential ease-out. No bounce or elastic.

## Components

- **PressableScale**: Primary interactive primitive. Scales down on press and springs back.
- **PetCanvas**: Creature rendering with mood/reaction states.
- **BottomSheet**: Modal-like panel for collectibles, quests, etc.
- **Sidebar**: Edge-swipe navigation panel.

## Layout Conventions

- Content uses edge-to-edge screens with safe-area insets.
- Cards sit on `colors.surface` with 1 px `colors.border` borders.
- Avoid nested cards; keep hierarchy through surface depth and spacing.
- Touch targets minimum 44×44 pt.

## Accessibility

- Honor `prefers-reduced-motion`.
- Maintain WCAG AA contrast for text.
- Use clear icon + label pairings for actions.
