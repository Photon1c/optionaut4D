# Deployment Guide - Option Rockets to Netlify

This guide will walk you through deploying the Option Rockets visualization to Netlify via GitHub.

## Prerequisites

- GitHub account
- Netlify account (free tier works great)
- Git installed locally

## Step 1: Prepare Your Repository

### Files to Include

Make sure these files are in your repository:

```
AGIworld/
├── backend/
│   └── rockets.html          ✅ Main HTML file
├── src/
│   └── rockets/
│       ├── rockets-entry.js  ✅ Physics & Three.js code
│       └── rocketState.js    ✅ State management
├── package.json              ✅ Dependencies
├── vite.config.js            ✅ Build configuration
├── netlify.toml              ✅ Netlify settings
└── README.md                 ✅ Documentation
```

### Files to Exclude (add to .gitignore)

```
node_modules/
dist/
.env
.DS_Store
*.log
```

## Step 2: Push to GitHub

### Option A: New Repository

```bash
# Initialize git (if not already done)
cd d:\SereneOcean\thecheddarlab\multiagent_frameworks\multiagentthreejs\AGIworld
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Option Rockets with orbital mechanics"

# Create a new repository on GitHub (https://github.com/new)
# Then link it:
git remote add origin https://github.com/YOUR_USERNAME/AGIworld.git
git branch -M main
git push -u origin main
```

### Option B: Existing Repository

```bash
# Add and commit your changes
git add .
git commit -m "Add Option Rockets with orbital mechanics"
git push
```

## Step 3: Deploy to Netlify

### Method 1: Netlify UI (Recommended for First Deploy)

1. **Go to Netlify**: Visit [https://app.netlify.com](https://app.netlify.com)

2. **Sign in** with your GitHub account

3. **Click "Add new site"** → "Import an existing project"

4. **Connect to GitHub**:
   - Click "GitHub"
   - Authorize Netlify to access your repositories
   - Select your `AGIworld` repository

5. **Configure Build Settings**:
   - Netlify will auto-detect settings from `netlify.toml`
   - Verify these settings:
     ```
     Build command: npm run build
     Publish directory: dist
     ```

6. **Click "Deploy site"**

7. **Wait for deployment** (usually 1-2 minutes)

8. **Your site is live!** 🎉
   - Netlify will give you a URL like: `https://random-name-123456.netlify.app`
   - You can customize this in Site Settings → Domain Management

### Method 2: Netlify CLI (For Quick Deploys)

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy from your project directory
cd d:\SereneOcean\thecheddarlab\multiagent_frameworks\multiagentthreejs\AGIworld
netlify deploy --prod
```

## Step 4: Access Your Deployed App

Your Option Rockets visualization will be available at:

```
https://your-site-name.netlify.app/rockets.html
```

## Step 5: Custom Domain (Optional)

### Using Netlify Subdomain

1. Go to **Site Settings** → **Domain Management**
2. Click **Options** → **Edit site name**
3. Choose a custom subdomain: `option-rockets.netlify.app`

### Using Your Own Domain

1. Go to **Site Settings** → **Domain Management**
2. Click **Add custom domain**
3. Enter your domain (e.g., `rockets.yourdomain.com`)
4. Follow Netlify's DNS configuration instructions

## Continuous Deployment

Once connected, Netlify will automatically:

- ✅ Deploy when you push to `main` branch
- ✅ Create preview deployments for pull requests
- ✅ Run build checks before deploying
- ✅ Rollback to previous versions if needed

### To Deploy Updates:

```bash
# Make your changes
git add .
git commit -m "Update rocket physics"
git push

# Netlify automatically deploys! 🚀
```

## Troubleshooting

### Build Fails with "Could not resolve entry module 'index.html'"

**Error Message**:
```
error during build:
Could not resolve entry module "index.html".
```

**Solution**: This was already fixed! The `vite.config.js` now includes all HTML entry points:
```javascript
rollupOptions: {
  input: {
    main: resolve(__dirname, 'index.html'),
    rockets: resolve(__dirname, 'backend/rockets.html'),
    // ... other pages
  }
}
```

**Test locally before deploying**:
```bash
npm run build
```

If successful, you'll see output like:
```
✓ built in 5.88s
dist/backend/rockets.html  1.50 kB
```

### Build Fails

**Check build logs** in Netlify dashboard:
- Common issue: Missing dependencies
- Solution: Make sure `package.json` includes all dependencies

```bash
# Test build locally first
npm run build
```

### 404 Errors

**Issue**: Can't access `/rockets.html`

**Solution**: Check that:
1. `backend/rockets.html` exists in your repo
2. Vite config copies it to `dist/` during build
3. File is actually in the deployed `dist/` folder

### Blank Page

**Issue**: Page loads but shows nothing

**Solution**: 
1. Open browser console (F12) to check for errors
2. Common issue: Missing Three.js imports
3. Verify all paths in `rockets-entry.js` are correct

## Performance Optimization

Netlify automatically:
- ✅ Minifies JavaScript and CSS
- ✅ Compresses assets with Brotli/Gzip
- ✅ Serves via global CDN
- ✅ Caches static assets (configured in `netlify.toml`)

## Environment Variables (If Needed)

If you add API keys or backend services later:

1. Go to **Site Settings** → **Environment Variables**
2. Add your variables
3. Access them in code via `import.meta.env.VITE_YOUR_VAR`

## Monitoring

Netlify provides:
- **Analytics**: Traffic and performance metrics
- **Deploy logs**: Build history and status
- **Forms**: If you add contact forms later
- **Functions**: Serverless backend (if needed)

## Next Steps

After deployment:

1. ✅ Test the live site thoroughly
2. ✅ Share the URL with traders/users
3. ✅ Monitor analytics to see usage
4. ✅ Iterate based on feedback

## Support

- **Netlify Docs**: [https://docs.netlify.com](https://docs.netlify.com)
- **Netlify Community**: [https://answers.netlify.com](https://answers.netlify.com)
- **Vite Docs**: [https://vitejs.dev](https://vitejs.dev)

---

**Congratulations!** Your Option Rockets visualization is now live and accessible worldwide! 🚀🌍
