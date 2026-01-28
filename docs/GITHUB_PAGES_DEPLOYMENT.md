# GitHub Pages Deployment Guide

## Overview

**truesight.me is deployed on GitHub Pages**, not Vercel, Netlify, or Apache. This document clarifies how redirects and deployment work for GitHub Pages.

## Important Context

### What GitHub Pages Supports

✅ **Supported:**
- Static HTML, CSS, JavaScript files
- Client-side redirects (HTML meta refresh + JavaScript)
- Custom domains via `CNAME` file
- Automatic deployment from `main` branch

❌ **NOT Supported:**
- Server-side redirects (no `.htaccess`, `_redirects`, or `vercel.json` support)
- Server-side scripting (PHP, Python, etc.)
- Dynamic routing without client-side JavaScript

## Redirect Implementation

### How Redirects Work on GitHub Pages

Since GitHub Pages doesn't support server-side redirects, we use **HTML redirect files**:

1. **Create directory structure**: For path `/ttl/irs`, create `ttl/irs/index.html`
2. **Use HTML meta refresh**: `<meta http-equiv="refresh" content="0; url=...">`
3. **Add JavaScript fallback**: `window.location.replace(...)`
4. **Include canonical link**: `<link rel="canonical" href="...">`
5. **Add fallback link**: Visible link in case JavaScript is disabled

### Example: `/ttl/irs` Redirect

File: `ttl/irs/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=https://drive.google.com/drive/u/0/folders/1KP6JfrwbYgaij4kkHhvX5kSYYX_jruNL" />
    <link rel="canonical" href="https://drive.google.com/drive/u/0/folders/1KP6JfrwbYgaij4kkHhvX5kSYYX_jruNL" />
    <script>
      window.location.replace("https://drive.google.com/drive/u/0/folders/1KP6JfrwbYgaij4kkHhvX5kSYYX_jruNL");
    </script>
    <title>Redirecting...</title>
  </head>
  <body>
    <p>If you are not redirected automatically, <a href="https://drive.google.com/drive/u/0/folders/1KP6JfrwbYgaij4kkHhvX5kSYYX_jruNL">click here</a>.</p>
  </body>
</html>
```

### Why This Approach?

1. **Meta refresh**: Works even if JavaScript is disabled
2. **JavaScript redirect**: Faster and cleaner for modern browsers
3. **Canonical link**: Helps with SEO
4. **Fallback link**: Ensures accessibility

## Redirect Implementation

**All redirects are implemented as HTML files** (e.g., `ttl/irs/index.html`) with:
- Meta refresh tag
- JavaScript redirect
- Canonical link
- Fallback link

**No server-side configuration files are used** - GitHub Pages doesn't support them. Files like `_redirects` (Netlify), `.htaccess` (Apache), or `vercel.json` (Vercel) are not present in this repository since truesight.me is deployed exclusively on GitHub Pages.

## Adding a New Redirect

### Steps

1. **Create directory structure**:
   ```bash
   mkdir -p {path}
   ```

2. **Create `index.html` file**:
   ```bash
   touch {path}/index.html
   ```

3. **Add redirect HTML** (use the template above)

4. **Commit and push**:
   ```bash
   git add {path}/index.html
   git commit -m "Add redirect: {path}"
   git push origin main
   ```

5. **Verify**: Visit `https://truesight.me{path}` and confirm redirect works

### Example: Adding `/new-path` Redirect

```bash
mkdir -p new-path
cat > new-path/index.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=https://example.com" />
    <link rel="canonical" href="https://example.com" />
    <script>
      window.location.replace("https://example.com");
    </script>
    <title>Redirecting...</title>
  </head>
  <body>
    <p>If you are not redirected automatically, <a href="https://example.com">click here</a>.</p>
  </body>
</html>
EOF
```

## Deployment Process

### Automatic Deployment

1. **Push to `main` branch**: GitHub Pages automatically deploys
2. **Wait ~1-2 minutes**: Deployment usually completes quickly
3. **Verify**: Check `https://truesight.me` for changes

### Manual Deployment (if needed)

GitHub Pages deployment is automatic. If you need to trigger a redeploy:

1. Go to repository Settings → Pages
2. Click "Save" to trigger a rebuild (or make a small commit)

## Troubleshooting

### Redirect Not Working

1. **Check file exists**: Verify `{path}/index.html` exists in repository
2. **Check file location**: Must be in correct directory structure
3. **Clear cache**: Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
4. **Check GitHub Pages**: Verify deployment succeeded in repository Settings → Pages

### Changes Not Appearing

1. **Wait a few minutes**: GitHub Pages can take 1-2 minutes to update
2. **Check deployment status**: Repository Settings → Pages → Deployment history
3. **Verify branch**: Changes must be on `main` branch
4. **Clear cache**: Browser cache may show old version

### Custom Domain Issues

1. **Check `CNAME` file**: Must exist in repository root
2. **Verify DNS**: DNS records must point to GitHub Pages
3. **Check SSL**: GitHub Pages automatically provisions SSL certificates

## Best Practices

1. **Always use HTML redirects**: Don't rely on server-side redirects
2. **Include multiple redirect methods**: Meta refresh + JavaScript + fallback link
3. **Test redirects**: Verify in multiple browsers
4. **Keep redirect files simple**: Avoid complex JavaScript
5. **Document redirects**: Update README or redirect documentation when adding new redirects

## References

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Pages Custom Domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [HTML Meta Refresh](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta#http-equiv)

---

**Last Updated**: January 2025  
**Deployment Platform**: GitHub Pages  
**Custom Domain**: truesight.me
