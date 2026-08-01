# Test Site — No Domain Required

## Access URL

```
http://45.137.194.227:8080
```

## Deploy

```bash
bash server_setup/test_site/deploy_test_site.sh
```

## How It Works

A simple nginx server block on port **8080** serves static files from `/opt/test_site/` on the server. No domain, no SSL, no systemd service — just a static page.

## Multiple Test Sites

To add more test sites on different ports, change the port number and repeat:

| Site | Port | URL |
|------|------|-----|
| Test Site 1 | 8080 | `http://45.137.194.227:8080` |
| Test Site 2 | 8081 | `http://45.137.194.227:8081` |
| Test Site 3 | 8082 | `http://45.137.194.227:8082` |

Each just needs its own nginx config listening on a unique port and its own `/opt/test_site_X/` directory.

## Files

- `index.html` — The test page
- `nginx.conf` — Nginx server block config
- `deploy_test_site.sh` — One-command deploy script

## Remove Test Site

```bash
ssh root@45.137.194.227
rm /etc/nginx/sites-enabled/test_site
rm /etc/nginx/sites-available/test_site
systemctl reload nginx
rm -rf /opt/test_site
```
