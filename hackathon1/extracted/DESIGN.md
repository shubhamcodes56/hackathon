# Design System Specification: The Human Sentinel

## 1. Overview & Creative North Star
This design system moves away from the aggressive, dark, and "hacker-centric" tropes of traditional cybersecurity. Instead, it adopts the Creative North Star of **"The Digital Curator."** 

Our goal is to create an environment that feels like a high-end architectural space—quiet, secure, and impeccably organized. We reject the "template" look by embracing **Intentional Asymmetry** and **Tonal Depth**. Rather than using rigid boxes and lines, we use sophisticated layering and generous white space to guide the eye. This approach transforms complex security data into a calm, editorial experience that empowers the user rather than intimidating them.

## 2. Colors & Surface Architecture
Our palette is rooted in authority but executed with softness. We use Material Design token conventions to ensure programmatic consistency.

### The "No-Line" Rule
To maintain a premium, bespoke feel, **1px solid borders are strictly prohibited for sectioning.** Boundaries between content areas must be defined solely through:
1.  **Background Color Shifts:** Placing a `surface-container-low` section against a `surface` background.
2.  **Generous Spacing:** Using the void to define the edge.
3.  **Tonal Transitions:** Subtle shifts in hue to denote priority.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers, like stacked sheets of fine paper or frosted glass. Use the hierarchy below to define "importance" through depth:
*   **Base Layer:** `surface` (#f8f9fb) – The canvas of the application.
*   **Sectional Layer:** `surface-container-low` (#f3f4f6) – For large layout divisions.
*   **Component Layer:** `surface-container-lowest` (#ffffff) – Used for primary cards to create a "lifted" feel against the background.
*   **Interaction Layer:** `surface-container-high` (#e7e8ea) – For elements requiring immediate focus.

### The "Glass & Gradient" Rule
To inject "soul" into the interface:
*   **Glassmorphism:** Use for floating alerts or navigation overlays. Apply `surface-variant` at 60% opacity with a `24px` backdrop blur.
*   **Signature Textures:** For high-impact areas (Hero sections, critical CTAs), use a subtle linear gradient transitioning from `primary` (#003d9b) to `primary-container` (#0052cc). This creates a sense of "active protection" that flat color cannot replicate.

## 3. Typography: Editorial Authority
We utilize a dual-typeface system to balance professional reliability with human-centric warmth.

*   **Display & Headlines (Public Sans):** Chosen for its geometric stability. Use `display-lg` (3.5rem) with tight letter-spacing for a bold, editorial statement. Headlines should feel authoritative but accessible.
*   **Body & Titles (Inter):** Chosen for its exceptional legibility at scale. We prioritize large font sizes—`body-lg` at 1rem (16px) is our baseline for readability.
*   **The Hierarchy Logic:** Large headlines provide the "what," while spacious body copy provides the "why." This hierarchy reduces cognitive load, a critical requirement for a trust-based security product.

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are often messy. In this system, we convey hierarchy through light and material properties.

*   **The Layering Principle:** Avoid "Elevation 1, 2, 3" logic. Instead, stack your tokens. A `surface-container-lowest` card sitting on a `surface-container-low` background creates a natural, soft lift without a single pixel of shadow.
*   **Ambient Shadows:** When an element must float (e.g., a modal or floating action button), use a 12% opacity shadow tinted with the `primary` hue, with a blur radius of at least `40px`. This mimics natural light passing through a semi-transparent medium.
*   **The "Ghost Border" Fallback:** If a container lacks contrast against its background, use a "Ghost Border": `outline-variant` (#c3c6d6) at **15% opacity**. Never use a 100% opaque border.

## 5. Components: Softness & Intent

### Buttons
*   **Primary:** `primary` fill with `on-primary` text. `2rem` (xl) rounded corners. Use a subtle inner-glow (white at 10% opacity) on the top edge to add "premium" weight.
*   **Secondary:** `surface-container-high` fill. No border.
*   **Tertiary:** No background. Bold `primary` text with an underline that only appears on hover.

### Cards & Lists
*   **Rule:** Forbid the use of divider lines.
*   **Implementation:** Use `1.5rem` (md) vertical padding between list items. Separate high-level categories using a background shift to `surface-container-low`.
*   **Radius:** All cards must use `DEFAULT` (1rem) or `lg` (2rem) corner radius to maintain the "friendly" brand personality.

### Input Fields
*   **Style:** Minimalist. Use `surface-container-highest` as a subtle background fill. 
*   **Focus State:** Instead of a thick border, use a `2px` glow of `surface-tint` and a slight scale-up (1.01x) of the container to indicate activity.

### Specialized Security Components
*   **The "Safety Shield" Progress:** Use `secondary` (#006c47) for "All Clear" states. The progress bar should be thick (12px) with a `full` (9999px) radius.
*   **Glass Alert:** For critical security notifications, use a glassmorphic overlay that blurs the content beneath, forcing the user to address the "Safety" or "Warning" context immediately.

## 6. Do’s and Don’ts

### Do:
*   **Do** embrace white space. If a layout feels "full," increase the padding by 50%.
*   **Do** use `secondary` (Safety Green) as an accent for success, not just a status indicator.
*   **Do** align elements to a 12-column grid but break it intentionally with floating images or overlapping typography to create an "editorial" feel.

### Don’t:
*   **Don’t** use "Hacker Blue" (neon cyans) or dark-mode-only themes. This system lives in the light to foster transparency and trust.
*   **Don’t** use sharp 90-degree corners. Everything must feel approachable and "human-touched."
*   **Don’t** use high-contrast dividers. If you feel you need a line, use a gap instead.