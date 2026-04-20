# Spotify Recovery

When Spotify presence stops updating:

1. Confirm the user still has an active `spotify_connections` row.
2. Trigger `/v1/integrations/spotify/presence` from the dashboard or API.
3. If refresh fails, disconnect the integration and reconnect through `/v1/integrations/spotify/connect`.
4. Check worker logs for failed `spotify:refresh` jobs.
5. Confirm sanitized presence appears on `/v1/admin/overview` websocket updates.
