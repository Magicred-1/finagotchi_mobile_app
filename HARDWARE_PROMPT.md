# Hardware NFT prompt — Finagotchi ESP32-S3 companion

Two parts: (1) the master Nano Banana 2 prompt for regenerating/extending the NFT collection imagery, (2) instructions to port the render into the landing page.

---

## 1. Image generation (Nano Banana 2 / gemini-3.1-flash-image)

Attach `finagotchi/assets/logos/x_profile.png` (the circular cyan ghost icon) as a **reference image input**, 1:1 aspect ratio, then use this prompt:

```text
Premium product render of a fictional handheld companion device called "Finagotchi", in the design language of a Ledger Stax crypto wallet: a slim, sleek, premium rounded-rectangle handheld with a gently curved edge-to-edge E Ink style display and a dark navy aluminum frame.
Screen: the display shows exactly the character from the reference image — a simple, cute, rounded cyan (#35D7FF) ghost with two oval eyes and a tiny mouth on a deep navy (#07111F) background — crisp and centered, like a monochrome-ish e-ink screen glowing softly in cyan.
Controls: a small circular D-pad gamepad on the lower left below the screen and two small round buttons (A, B) on the lower right, plus a tiny battery indicator icon in the screen's top corner.
Body: matte deep navy-black anodized aluminum, one premium cyan accent line along the edge, minimal, expensive-looking, soft studio reflections.
Scene: floating at a slight three-quarter angle on a solid deep navy (#07111F) studio background with a soft cyan rim light.
Constraints: no text or logos beyond "FINAGOTCHI" in small clean capitals on the frame chin, no extra characters, no scenery, no harsh shadows, no photorealistic hands, no clutter. Premium NFT-collection product shot, 1:1 square.
```

For collection variants, change only the final scene line — e.g. "top-down flat lay", "back view showing engraved ghost outline and serial number", "two devices side by side, one showing the lavender evolution ghost". Keep everything else identical for collection coherence. Reference outputs: `finagotchi/assets/hardware/nft-device-1.png`, `nft-device-2.png`.

## 2. Port to the landing page (`finagotchi/landing/`)

Add a "Hardware" section between the forms cards and the CTA band:

- Two-column layout matching the hero: left = the NFT render (`assets/hardware/nft-device-2.png`, copy into `landing/assets/`), right = copy.
- Copy direction: eyebrow "ESP32-S3 COMPANION", heading "A ghost that lives on your desk.", body: one or two sentences — mirrors your creature over Bluetooth, e-ink style display, D-pad + two buttons, battery for days. End with a `btn-ghost` link "See the device".
- Reuse the existing design tokens (navy surfaces, 22px card radius, Poppins). The render's navy background blends directly into `--surface` cards — no cutout needed.
- Optional: add a `.creature-halo`-style radial glow behind the device image so it sits in the same visual family as the live hero creature.
- Mobile: stack image above copy, image max-width ~420px.

Keep the spec copy honest — it is an ESP32-S3 concept render for the NFT collection, not a shipping product page.
