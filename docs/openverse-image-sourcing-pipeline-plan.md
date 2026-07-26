# Implementation Plan — Openverse License-Safe Image Pipeline & Dataset Image Audit

This plan integrates programmatic **Openverse / Wikimedia Commons API license-safe image sourcing** into `scripts/pipeline.cjs` and audits all 129 destinations to eliminate duplicate or irrelevant photos.

---

## 1. Programmatic License-Safe Image Sourcing (`scripts/pipeline.cjs`)

We extend `scripts/pipeline.cjs` with an automated image-sourcing stage:

```
GET https://api.openverse.org/v1/images/?q={Destination+Name}+Japan&license_type=commercial
```

### Features:

1. **License Filtering**: Filter API results to commercial-safe licenses (`CC0`, `CC-BY`, `CC-BY-SA`, Public Domain).
2. **Attribution & Metadata**: Store `imageMetadata` (source, license type, creator attribution, source URL) directly inside destination JSON objects:
   ```json
   "imageMetadata": {
     "source": "Openverse",
     "license": "CC-BY-2.0",
     "attribution": "Photo by John Doe via Openverse / Wikimedia",
     "sourceUrl": "https://openverse.org/image/..."
   }
   ```

````
3. **Automated Fallback Chain**:
 - Openverse API (Primary: Wikimedia Commons, Flickr CC-BY)
 - Wikipedia Lead Image API (Secondary)
 - Unsplash / Pexels (Tertiary)

---

## 2. Dataset Image Audit & Deduplication (129 Destinations)

Audit `src/shared/data/destinations-index.json` and all 129 files in `public/data/destinations/`:
- Detect all duplicate `heroImage` and `image` URLs.
- Replace duplicate URLs with location-specific, verified high-res imagery.

---

## Proposed Changes

### Build Scripts
#### [MODIFY] `scripts/pipeline.cjs`
- Add Stage 4.5: License-Safe Openverse & Wikimedia Image Sourcing & Deduplication Check.

### Dataset & Public Files
#### [MODIFY] `src/shared/data/destinations-index.json`
- Update destination objects with unique images and `imageMetadata`.

#### [MODIFY] `public/data/destinations/*.json`
- Sync all individual public destination detail JSON files.

---

## Verification Plan

### Automated Tests
- Run pipeline with validation flags:
```bash
node scripts/pipeline.cjs --validate-only
npx vitest run
npm run build
````

### Manual Verification

- Check `/destinations` to confirm 100% unique image coverage with zero duplicate URLs across the entire 129-destination catalog.
