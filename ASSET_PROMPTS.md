# RunLatch — optional Gemini image prompts

**For the later design stage, not a task to execute now.** David has access to Gemini image generation and can generate original supporting assets when requested. This is not permission to upload private files or publish images. No generated image is installed/approved yet.

## What may be useful

One original supporting hero illustration or static fallback: an abstract spending boundary/latch with incoming requests, one permitted path, and rejected paths stopping outside. It must support—not replace—the real Run Board and inspectable receipts.

We may not need a raster asset: the first choice remains a custom dithercn field and static SVG/CSS data fills. Generate only if browser composition review shows the illustration improves the story. No stock photo, generic AI orb, wallet mockup, decorative chart, or full set of assets by default.

## Prompt 1 — clean master illustration for later dither treatment

Copy this prompt into Gemini **when we reach visual implementation**:

> Create one original editorial illustration for RunLatch, a software product that gives an AI task a bounded spending authorization. The concept is a latch: a request can pass through only when it fits the task's permitted boundary. This is an abstract software-control illustration, not a real hardware product and not an app screenshot.
>
> **Composition:** wide 16:9 landscape, aim for 2400 × 1350 or the closest supported high-resolution size. Keep the left 42% and the upper-left region quiet and nearly empty for a real HTML headline and controls. Place the visual mainly in the right half, with generous whitespace and a clean transition into the background. It must also crop convincingly around the central-right object on a phone.
>
> **Subject:** a flat, precise, top-down diagram-like arrangement of one softly rectangular bounded chamber and a simple latch/gate in its edge. A few thin paths made of small geometric request marks approach from outside. Exactly one path passes neatly through the open permitted channel; two other paths terminate clearly outside the boundary rather than crashing, exploding, or glowing. Suggest controlled flow and finite capacity through geometry and spacing, not words or financial symbols. The latch should be visually understandable without looking like a padlock/security-logo cliché. Do not imply that all requests are permitted.
>
> **Art direction:** calm editorial fintech meets AI infrastructure; precise, print-ready, restrained, almost an engineering drawing. Use simple geometric forms, clean fine ink lines, a few broad quiet tonal surfaces, balanced negative space, and deliberate asymmetry. No glossy rendering, heavy 3D, cinematic lighting, dramatic perspective, glassmorphism, gaming aesthetic, sci-fi circuitry, neon bloom, or generic AI-brain/cloud imagery.
>
> **Palette:** warm near-white paper approximately #F7F7F2, near-black ink approximately #171916, supporting muted gray-green approximately #686D65. A very small lime accent approximately #C6F36B may mark the permitted channel only; keep most of the image monochrome. The background must be uniform paper-colored, not a gradient or stock texture. Keep good shape contrast without making the image visually loud.
>
> **Rendering:** generate a clean high-resolution continuous-tone master, not pre-dithered pixel art. No baked Bayer grid, random digital noise, film grain, dense hatch over empty text space, or stipple that obscures shapes. The application will apply its own consistent theme-aware dithercn treatment later. Keep edges and broad tonal regions suitable for conversion to a limited-color dither.
>
> **Strict exclusions:** no text of any kind, numbers, tick labels, financial amounts, transaction hashes, quote IDs, wallet addresses, code, UI panels, buttons, table rows, charts, badges, logos, brand marks, NEAR/Solana/Gemini/Roster symbols, watermarks, people, photographs, or invented product evidence. Do not reproduce another company's illustration or product interface. Make the geometry original.
>
> Deliver a single clean illustration, not a collage, multi-panel sheet, or promotional poster. The image should remain understandable at small size and with color/effects removed. Preserve the quiet headline area and avoid an obvious rectangular image-card frame.

### Optional refinement after reviewing the first result

> Keep the same original composition and geometry. Reduce visual clutter by about one third. Make the boundary and one permitted path easier to distinguish, keep all blocked paths visibly outside, and simplify fine detail that would disappear at 390px screen width. Flatten any unintended 3D/shadows and keep the left 42% completely calm. Remove all text-like marks, logos, UI-like rectangles, and grain. Retain only paper, ink, muted support, and a tiny lime accent. Return one high-resolution clean master.

## What to save and how to hand it over

- Save the full-resolution original output without reducing it to a screenshot. PNG or a lossless export is preferred for the master; actual supported formats/sizes depend on your Gemini interface.
- Suggested filenames: `runlatch-latch-master-v1.png`, then v2/v3 for refinements. Do not overwrite the original when editing.
- Keep the exact prompt, generator/model/version if shown, and generation date. No API key, account details, private prompt history, or wallet information in the metadata record.
- Do not upload the entire project, private artifacts, actual policies/receipts/addresses, or Roster screenshots to the generator. This product-description prompt is enough.
- Later provide the local file path or attach the image here. We will inspect it before choosing/cropping/compressing or committing it. Do not publish it yet.

## Integration/review gate

1. Confirm the generator's current usage/commercial terms and any required disclosure; do not assume legal clearance, trademark rights, or exclusive originality.
2. Review for copied-looking expression, unwanted text/logos, false UI/data, overly generic imagery, incorrect flow semantics, and clutter.
3. Inspect desktop/phone crops and measure actual text/background contrast. Important text/values stay semantic HTML/SVG, never in the generated asset.
4. Apply dither via the actual engine if an image treatment is chosen; avoid double-dithering. Keep original/master separately from optimized web output.
5. Use a responsive optimized web format with explicit dimensions and modest download cost. Decorative art is aria-hidden/pointer-inert; the product remains useful with it disabled.
6. Record provenance/license review in third-party/asset notices and actual file changes in BUILD_LOG.md before any public release.

No additional images, illustration library, paid plan, or generator integration is required for the MVP. If this art does not improve the real product-first page, omit it.
