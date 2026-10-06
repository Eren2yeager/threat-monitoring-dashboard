# Predator Monitor dashboard

Local Next.js dashboard for the sibling RF-DETR model service. The browser only calls
this dashboard; its Route Handlers proxy frames to the model server and store threat
settings and detection event metadata in MongoDB.

## Run locally

1. Start the local MongoDB service.
2. In `model-server`, start the detector at `http://127.0.0.1:8000`.
3. In this directory, copy `.env.example` to `.env.local` if you need to change either
   service URL. Defaults are `mongodb://127.0.0.1:27017/wildlife_dashboard` and
   `http://127.0.0.1:8000`.
4. Install and run with Bun:

   ```powershell
   bun install
   bun run dev
   ```

5. Open `http://localhost:3000`. `/api/health` shows readiness for MongoDB and the
   model server. The app seeds all 20 model classes to Medium the first time settings
   are opened.

The monitor supports one webcam or browser screen share at a time. It samples at most
two frames per second, resizes each frame to a 640-pixel maximum edge, and avoids
overlapping inference requests. High-threat class appearances sound one browser alarm;
the episode re-arms after the class has been absent for two seconds.

Only event metadata is stored in `detectionEvents`: source, class, confidence, box,
threat level, and appearance timestamps. Frames and videos are not stored. Use the
Event history page to remove saved event metadata when desired.

## API routes

- `GET /api/health` — dashboard, MongoDB, and model-server readiness.
- `GET /api/threat-classes` / `PATCH /api/threat-classes` — read or update class levels.
- `POST /api/monitor/frame` — proxy one resized image to model-server `/detect` and
  return annotated detections and any newly triggered alarm.
- `POST /api/monitor/end` — close presence episodes when monitoring stops.
- `GET /api/events` / `DELETE /api/events` — list or manually clear saved appearances.

## Checks

```powershell
bun run test
bun run lint
bun run build
```
