# Streamyard Discovery Backend (PoC)

Simple NodeJS + MongoDB backend for room discovery and metadata.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

## Endpoints

- `POST /room` → create new broadcast room
- `POST /room/:id/join` → join as host/guest/audience
- `GET /room/:id` → fetch room metadata
- `POST /room/:id/start` → mark room live
- `POST /room/:id/stop` → mark room ended

### Create room

```json
{
  "title": "My Live Show",
  "hostId": "user_123",
  "hlsPlaybackUrl": "https://cdn.example.com/live/stream.m3u8"
}
```

### Join room

```json
{
  "userId": "user_456"
}
```
