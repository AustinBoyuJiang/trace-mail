# Collector deployment

Requires Node.js 24 or newer and persistent storage. There are no npm dependencies.

```sh
npm start
```

The default local server is `http://127.0.0.1:4318`. On first launch it creates `server/data/access-token` unless `TRACE_TOKEN` is supplied. Keep this token private. The private API uses Bearer authentication; public `/t/…` image URLs contain only a random message ID.

Real tracking needs a public HTTPS origin reachable by recipients and image proxies. Set `PUBLIC_BASE_URL` to that origin; enter the same URL in extension Settings. Localhost works only for local checks.

| Variable | Purpose |
| --- | --- |
| `PUBLIC_BASE_URL` | Public HTTPS origin, e.g. `https://trace.example.com`; no path. |
| `TRACE_TOKEN` | Random secret of at least 32 characters. |
| `HOST` | Defaults to loopback; use `0.0.0.0` in a container. |
| `PORT` | Defaults to `4318`. |
| `DB_PATH` | Defaults to `server/data/trace.sqlite`; keep on persistent disk. |
| `RETENTION_DAYS` | Defaults to 90. |

Copy `server/.env.example` into a private env file. It is an example, not automatically loaded. For a local copied file use `node --env-file=server/.env server/index.mjs`. Generate a token locally, for example with `openssl rand -hex 32`.

## Docker and HTTPS

```sh
docker build -t trace-mail .
docker run -d --name trace-mail --restart unless-stopped \
  --env-file /absolute/path/to/trace.env \
  -p 127.0.0.1:4318:4318 \
  -v trace-data:/app/server/data \
  trace-mail
```

Put an HTTPS reverse proxy in front of the loopback port. Example Caddy configuration:

```caddyfile
trace.example.com {
    reverse_proxy 127.0.0.1:4318
}
```

`GET /health` returns product and version. Private `/v1/…` requests without authentication return 401. The public tracking GIF must be anonymously accessible; an interactive login/challenge prevents image proxies from fetching it. The collector is single-user; a team service requires separate authentication and isolation.

## CapRover and independently managed services

CapRover regenerates `/captain/generated/nginx` when its configuration changes. Do not keep a manually added route or include only in that directory: it can disappear while the collector container remains healthy. Without its HTTPS server block, the domain may fall through to CapRover's default self-signed certificate, causing the extension to display `Offline`.

For a collector managed outside CapRover's app registry, keep its server blocks in `/captain/data/nginx-shared/trace-mail.conf` on the host (available as `/nginx-shared/trace-mail.conf` inside Nginx). In CapRover's persistent **NGINX Base Config** template, add this line inside the existing `http` block, retaining its normal includes:

```nginx
include /nginx-shared/trace-mail.conf;
```

Back up the current settings first. Validate the generated configuration with `nginx -t`, reload Nginx, and verify that the include survives configuration regeneration. Keep certificate renewal configured for the separate route. Do not also load the same server blocks through an extra generated file.

See [CapRover's NGINX customization documentation](https://caprover.com/docs/nginx-customization.html) for persistent templates and shared-file paths.

## Updates and recovery

Back up the SQLite database before updating. For an online backup use SQLite's backup API rather than copying an active database file without its journal. Preserve the data volume and access token when rebuilding the container. Apply backend and extension updates together.

Private operational details, tokens, database files and machine-specific installation configuration belong in ignored local files or a secret manager. Do not commit them.
