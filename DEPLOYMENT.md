# AWS Deployment Guide for FallOwl

This guide helps you deploy the FallOwl application to AWS EC2.

## Prerequisites

- Ubuntu server on AWS EC2
- Node.js installed (v20+)
- PM2 installed globally (`npm install -g pm2`)
- Git installed

## Deployment Steps

### 1. Clone the Repository

```bash
cd ~
git clone <your-repo-url> Fallowl
cd Fallowl
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root with all required environment variables:

```bash
nano .env
```

Add these variables (update with your actual values):

```env
NODE_ENV=production
PORT=5000

# Security
SESSION_SECRET="<your-session-secret>"
ENCRYPTION_KEY="<your-encryption-key>"

# Database
DATABASE_URL="<your-postgres-connection-string>"

# Auth0 (Backend)
AUTH0_DOMAIN="${VITE_AUTH0_DOMAIN}"
AUTH0_CLIENT_ID="<your-auth0-client-id>"
AUTH0_CLIENT_SECRET="<your-auth0-client-secret>"
AUTH0_AUDIENCE="https://api.fallowl.com"

# Auth0 (Frontend - required for build)
VITE_AUTH0_DOMAIN="${VITE_AUTH0_DOMAIN}"
VITE_AUTH0_CLIENT_ID="<your-auth0-client-id>"
VITE_AUTH0_AUDIENCE="https://api.fallowl.com"

# BunnyCDN
BUNNYCDN_API_KEY="<your-bunnycdn-api-key>"
BUNNYCDN_REGION="storage.bunnycdn.com"
BUNNYCDN_STORAGE_ZONE="<your-storage-zone>"
BUNNYCDN_PULL_ZONE_URL="<your-cdn-domain>"

# CORS - CRITICAL for production
CLIENT_ORIGIN="https://app.fallowl.com"
```

### 4. Build the Application

**IMPORTANT**: Export VITE_ variables before building to ensure they're baked into the frontend:

```bash
export VITE_AUTH0_DOMAIN="${VITE_AUTH0_DOMAIN}"
export VITE_AUTH0_CLIENT_ID="<your-auth0-client-id>"
export VITE_AUTH0_AUDIENCE="https://api.fallowl.com"

npm run build
```

### 5. Start with PM2

```bash
# Make start script executable (if not already)
chmod +x start.sh

# Start the application
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
pm2 startup
# Run the command that PM2 outputs

pm2 save
```

### 6. Configure Nginx

Create an Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/fallowl
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name app.fallowl.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/fallowl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Set Up SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.fallowl.com
```

## Updating the Application

When you need to deploy updates:

```bash
cd ~/Fallowl

# Pull latest changes
git pull origin main

# If VITE_ variables changed, export them again
export VITE_AUTH0_DOMAIN="${VITE_AUTH0_DOMAIN}"
export VITE_AUTH0_CLIENT_ID="<your-auth0-client-id>"
export VITE_AUTH0_AUDIENCE="https://api.fallowl.com"

# Rebuild
npm run build

# Restart PM2
pm2 restart fallowl
```

## Troubleshooting

### Check PM2 Status
```bash
pm2 status
pm2 logs fallowl --lines 50
```

### Check if Port 5000 is Running
```bash
sudo netstat -tlnp | grep 5000
```

### Check Nginx Status
```bash
sudo systemctl status nginx
sudo nginx -t
```

### Database Connection Issues
If you see "getaddrinfo EAI_AGAIN undefined" errors, verify:
1. DATABASE_URL is in your `.env` file
2. The `start.sh` script is being used (it loads the .env file)
3. Restart PM2: `pm2 restart fallowl`

### Auth0 "placeholder" Client ID
If Auth0 shows placeholder client ID:
1. Ensure VITE_AUTH0_CLIENT_ID is in `.env`
2. Export it before building: `export VITE_AUTH0_CLIENT_ID="your-id"`
3. Rebuild: `npm run build`
4. Clear browser cache or use incognito mode

## PM2 Commands Reference

```bash
pm2 start ecosystem.config.cjs  # Start application
pm2 restart fallowl             # Restart application
pm2 stop fallowl                # Stop application
pm2 delete fallowl              # Remove from PM2
pm2 logs fallowl                # View logs
pm2 monit                       # Monitor resources
pm2 save                        # Save current processes
```
