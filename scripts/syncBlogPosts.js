#!/usr/bin/env node
/**
 * Fetch all blog posts from Wix and generate static HTML files
 * 
 * Usage:
 *   node scripts/syncBlogPosts.js
 * 
 * Requires .env file with:
 *   WIX_API_KEY=...
 *   WIX_SITE_ID=... (optional, defaults to TrueSight DAO)
 *   WIX_ACCOUNT_ID=... (optional, defaults to TrueSight DAO)
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.WIX_API_KEY;
const SITE_ID = process.env.WIX_SITE_ID || "d45a189f-d0cc-48de-95ee-30635a95385f";
const ACCOUNT_ID = process.env.WIX_ACCOUNT_ID || "0e2cde5f-b353-468b-9f4e-36835fc60a0e";

if (!API_KEY) {
  console.error("❌ Missing WIX_API_KEY in .env file.");
  process.exit(1);
}

const BLOG_API_URL = "https://www.wixapis.com/blog/v3/posts";
const HEADERS = {
  Authorization: API_KEY,
  "Content-Type": "application/json",
  "wix-site-id": SITE_ID,
  "wix-account-id": ACCOUNT_ID,
};
const BLOG_DIR = path.join(__dirname, "..", "blog");
const BLOG_POSTS_DIR = path.join(BLOG_DIR, "posts");
const DATA_DIR = path.join(__dirname, "..", "data");

/**
 * Query all blog posts from Wix
 */
async function queryBlogPosts() {
  const url = `${BLOG_API_URL}/query`;
  let allPosts = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const body = {
      query: {
        paging: { limit, offset },
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Failed to query blog posts (${response.status}): ${error.message || response.statusText}`);
    }

    const payload = await response.json();
    const posts = payload.posts || [];
    allPosts = allPosts.concat(posts);

    const total = payload.pagingMetadata?.total || 0;
    console.log(`   📄 Fetched ${allPosts.length} of ${total} posts...`);

    if (allPosts.length >= total || posts.length < limit) {
      break;
    }

    offset += limit;
  }

  return allPosts;
}

/**
 * Convert Ricos rich content to HTML
 */
function ricosToHTML(ricos) {
  if (!ricos || !ricos.nodes) {
    return "";
  }

  let html = "";

  function processNode(node) {
    if (!node) return "";

    switch (node.type) {
      case "PARAGRAPH":
        const paraContent = (node.nodes || []).map(processNode).join("");
        return `<p>${paraContent || "<br>"}</p>`;

      case "HEADING":
        const headingContent = (node.nodes || []).map(processNode).join("");
        const level = node.headingData?.level || 1;
        return `<h${level}>${headingContent}</h${level}>`;

      case "TEXT":
        let text = node.textData?.text || "";
        const decorations = node.textData?.decorations || [];
        
        decorations.forEach((dec) => {
          if (dec === "BOLD") {
            text = `<strong>${text}</strong>`;
          } else if (dec === "ITALIC") {
            text = `<em>${text}</em>`;
          } else if (dec === "UNDERLINE") {
            text = `<u>${text}</u>`;
          }
        });
        
        return text;

      case "LINK":
        const linkContent = (node.nodes || []).map(processNode).join("");
        const url = node.linkData?.url?.url || "#";
        const target = node.linkData?.target || "_self";
        return `<a href="${url}" target="${target}" rel="noreferrer">${linkContent}</a>`;

      case "IMAGE":
        const imageUrl = node.imageData?.file?.url || node.imageData?.src?.url || "";
        const alt = node.imageData?.altText || "";
        const caption = node.imageData?.caption || "";
        let imageHTML = `<img src="${imageUrl}" alt="${alt}" loading="lazy" />`;
        if (caption) {
          imageHTML = `<figure>${imageHTML}<figcaption>${caption}</figcaption></figure>`;
        }
        return imageHTML;

      case "LIST":
        const listItems = (node.nodes || []).map(processNode).join("");
        const listType = node.listData?.type || "ORDERED";
        const tag = listType === "ORDERED" ? "ol" : "ul";
        return `<${tag}>${listItems}</${tag}>`;

      case "LIST_ITEM":
        const itemContent = (node.nodes || []).map(processNode).join("");
        return `<li>${itemContent}</li>`;

      case "BLOCKQUOTE":
        const quoteContent = (node.nodes || []).map(processNode).join("");
        return `<blockquote>${quoteContent}</blockquote>`;

      case "CODE_BLOCK":
        const code = node.codeBlockData?.code || "";
        const language = node.codeBlockData?.language || "";
        return `<pre><code class="language-${language}">${escapeHTML(code)}</code></pre>`;

      case "DIVIDER":
        return `<hr />`;

      default:
        // Fallback: try to process child nodes
        if (node.nodes && Array.isArray(node.nodes)) {
          return node.nodes.map(processNode).join("");
        }
        return "";
    }
  }

  ricos.nodes.forEach((node) => {
    html += processNode(node);
  });

  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate slug from title
 */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Generate HTML for a blog post
 */
function generatePostHTML(post, allPosts) {
  const title = post.title || "Untitled";
  const slug = post.slug || slugify(title);
  const publishDate = formatDate(post.publishDate);
  const excerpt = post.excerpt || "";
  const content = ricosToHTML(post.richContent);
  const coverImage = post.coverImage?.url || "";
  const author = post.author?.name || "TrueSight DAO";
  const tags = (post.tags || []).map((tag) => tag.name || tag).join(", ");

  // Find previous and next posts (sorted by date)
  const sortedPosts = [...allPosts].sort((a, b) => {
    const dateA = new Date(a.publishDate || 0);
    const dateB = new Date(b.publishDate || 0);
    return dateB - dateA;
  });
  const currentIndex = sortedPosts.findIndex((p) => p.id === post.id);
  const prevPost = currentIndex > 0 ? sortedPosts[currentIndex - 1] : null;
  const nextPost = currentIndex < sortedPosts.length - 1 ? sortedPosts[currentIndex + 1] : null;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHTML(title)} | TrueSight DAO Blog</title>
    <meta name="description" content="${escapeHTML(excerpt)}" />
    <link
      rel="icon"
      href="https://static.wixstatic.com/ficons/0e2cde_dd65db118f8f499eb06c159d7262167d%7Emv2.ico"
      type="image/x-icon"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../../styles/main.css" />
  </head>
  <body>
    <nav class="site-header">
      <div class="header-container">
        <a href="../../index.html" class="header-logo">
          <img
            src="https://static.wixstatic.com/media/0e2cde_f81b16c82ebe4aaca4b5ce54b819a693~mv2.png/v1/fill/w_622,h_160,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/20240612_truesight_dao_logo_long.png"
            alt="TrueSight DAO"
            width="155"
            height="40"
            loading="eager"
          />
        </a>
        <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <ul class="nav-menu" aria-hidden="true">
          <li><a href="../../index.html">Home</a></li>
          <li><a href="../../agroverse.html">Agroverse</a></li>
          <li><a href="../../sunmint.html">Sunmint</a></li>
          <li><a href="../../edgar.html">Edgar</a></li>
          <li><a href="../../about-us.html">About Us</a></li>
          <li><a href="../index.html">Blog</a></li>
          <li><a href="https://truesight.me/whitepaper" target="_blank" rel="noreferrer">Whitepaper</a></li>
          <li><a href="https://dapp.truesight.me" target="_blank" rel="noreferrer">DApp</a></li>
        </ul>
      </div>
    </nav>
    <div class="page blog-post-page">
      <article class="blog-post">
        <header class="blog-post-header">
          <a href="../index.html" class="text-link" style="margin-bottom: var(--space-md); display: inline-block;">← Back to Blog</a>
          <h1>${escapeHTML(title)}</h1>
          <div class="blog-post-meta">
            <time datetime="${post.publishDate || ""}">${publishDate}</time>
            ${author ? `<span>by ${escapeHTML(author)}</span>` : ""}
            ${tags ? `<span class="blog-tags">${escapeHTML(tags)}</span>` : ""}
          </div>
          ${coverImage ? `<img src="${coverImage}" alt="${escapeHTML(title)}" class="blog-post-cover" loading="eager" />` : ""}
        </header>
        <div class="blog-post-content">
          ${content}
        </div>
        <footer class="blog-post-footer">
          ${prevPost ? `<a href="${slugify(prevPost.title || prevPost.slug || "")}.html" class="text-link">← ${escapeHTML(prevPost.title || "Previous Post")}</a>` : ""}
          ${nextPost ? `<a href="${slugify(nextPost.title || nextPost.slug || "")}.html" class="text-link" style="margin-left: auto;">${escapeHTML(nextPost.title || "Next Post")} →</a>` : ""}
        </footer>
      </article>
    </div>
    <footer class="footer">
      <div class="footer-content">
        <h2>JOIN OUR MOVEMENT</h2>
        <p>Co-Create with us</p>
        <div class="footer-social">
          <a href="https://t.me/TrueSightDAO" target="_blank" rel="noreferrer noopener" aria-label="Telegram">
            <img
              src="../../assets/telegram-icon.jpg"
              alt="Telegram"
              width="48"
              height="48"
              loading="lazy"
            />
          </a>
          <a href="https://github.com/TrueSightDAO" target="_blank" rel="noreferrer noopener" aria-label="GitHub">
            <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor">
              <title>GitHub</title>
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </div>
    </footer>
    <script>
      // Hamburger menu toggle
      (function() {
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const siteHeader = document.querySelector('.site-header');
        
        if (!menuToggle || !navMenu) return;
        
        menuToggle.addEventListener('click', function() {
          const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
          menuToggle.setAttribute('aria-expanded', !isExpanded);
          navMenu.setAttribute('aria-hidden', isExpanded);
          siteHeader.classList.toggle('menu-open', !isExpanded);
        });
        
        navMenu.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
        
        siteHeader.addEventListener('click', function(e) {
          if (e.target === siteHeader || e.target.classList.contains('site-header')) {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
      })();
    </script>
  </body>
</html>`;
}

/**
 * Generate blog listing page
 */
function generateBlogIndexHTML(posts) {
  const postsHTML = posts
    .map((post) => {
      const title = post.title || "Untitled";
      const slug = post.slug || slugify(title);
      const publishDate = formatDate(post.publishDate);
      const excerpt = post.excerpt || "";
      const coverImage = post.coverImage?.url || "";
      const readTime = post.readTime || "";

      return `
        <article class="blog-card">
          ${coverImage ? `<img src="${coverImage}" alt="${escapeHTML(title)}" class="blog-card-image" loading="lazy" />` : ""}
          <div class="blog-card-content">
            ${publishDate ? `<time datetime="${post.publishDate || ""}" class="blog-card-date">${publishDate}</time>` : ""}
            <h2><a href="posts/${slug}.html">${escapeHTML(title)}</a></h2>
            ${excerpt ? `<p class="blog-card-excerpt">${escapeHTML(excerpt)}</p>` : ""}
            <div class="blog-card-footer">
              <a href="posts/${slug}.html" class="text-link">Read more →</a>
              ${readTime ? `<span class="blog-read-time">${readTime}</span>` : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blog | TrueSight DAO</title>
    <meta name="description" content="Read the latest updates, insights, and stories from TrueSight DAO" />
    <link
      rel="icon"
      href="https://static.wixstatic.com/ficons/0e2cde_dd65db118f8f499eb06c159d7262167d%7Emv2.ico"
      type="image/x-icon"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../styles/main.css" />
  </head>
  <body>
    <nav class="site-header">
      <div class="header-container">
        <a href="../index.html" class="header-logo">
          <img
            src="https://static.wixstatic.com/media/0e2cde_f81b16c82ebe4aaca4b5ce54b819a693~mv2.png/v1/fill/w_622,h_160,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/20240612_truesight_dao_logo_long.png"
            alt="TrueSight DAO"
            width="155"
            height="40"
            loading="eager"
          />
        </a>
        <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <ul class="nav-menu" aria-hidden="true">
          <li><a href="../index.html">Home</a></li>
          <li><a href="../agroverse.html">Agroverse</a></li>
          <li><a href="../sunmint.html">Sunmint</a></li>
          <li><a href="../edgar.html">Edgar</a></li>
          <li><a href="../about-us.html">About Us</a></li>
          <li><a href="index.html">Blog</a></li>
          <li><a href="https://truesight.me/whitepaper" target="_blank" rel="noreferrer">Whitepaper</a></li>
          <li><a href="https://dapp.truesight.me" target="_blank" rel="noreferrer">DApp</a></li>
        </ul>
      </div>
    </nav>
    <div class="page blog-page">
      <header class="hero">
        <h1>TrueSight DAO Blog</h1>
        <p class="section-lead">
          Stories, insights, and updates from our journey to heal the world with love.
        </p>
      </header>
      <section>
        <div class="blog-grid">
          ${postsHTML || "<p>No blog posts found.</p>"}
        </div>
      </section>
    </div>
    <footer class="footer">
      <div class="footer-content">
        <h2>JOIN OUR MOVEMENT</h2>
        <p>Co-Create with us</p>
        <div class="footer-social">
          <a href="https://t.me/TrueSightDAO" target="_blank" rel="noreferrer noopener" aria-label="Telegram">
            <img
              src="../assets/telegram-icon.jpg"
              alt="Telegram"
              width="48"
              height="48"
              loading="lazy"
            />
          </a>
          <a href="https://github.com/TrueSightDAO" target="_blank" rel="noreferrer noopener" aria-label="GitHub">
            <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor">
              <title>GitHub</title>
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </div>
    </footer>
    <script>
      // Hamburger menu toggle
      (function() {
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const siteHeader = document.querySelector('.site-header');
        
        if (!menuToggle || !navMenu) return;
        
        menuToggle.addEventListener('click', function() {
          const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
          menuToggle.setAttribute('aria-expanded', !isExpanded);
          navMenu.setAttribute('aria-hidden', isExpanded);
          siteHeader.classList.toggle('menu-open', !isExpanded);
        });
        
        navMenu.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
        
        siteHeader.addEventListener('click', function(e) {
          if (e.target === siteHeader || e.target.classList.contains('site-header')) {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
      })();
    </script>
  </body>
</html>`;
}

/**
 * Main sync function
 */
async function main() {
  console.log("📝 Syncing blog posts from Wix...\n");

  // Create directories
  await fs.promises.mkdir(BLOG_DIR, { recursive: true });
  await fs.promises.mkdir(BLOG_POSTS_DIR, { recursive: true });

  try {
    // Fetch all blog posts
    const posts = await queryBlogPosts();
    console.log(`\n✅ Fetched ${posts.length} blog posts`);

    if (posts.length === 0) {
      console.log("   ℹ️  No blog posts found.");
      return;
    }

    // Save posts data as JSON
    const postsData = posts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug || slugify(post.title || ""),
      excerpt: post.excerpt,
      publishDate: post.publishDate,
      coverImage: post.coverImage?.url || "",
      author: post.author?.name || "",
      tags: (post.tags || []).map((tag) => tag.name || tag),
      readTime: post.readTime,
      url: post.url,
    }));

    await fs.promises.writeFile(
      path.join(DATA_DIR, "blog-posts.js"),
      `// Auto-generated by scripts/syncBlogPosts.js on ${new Date().toISOString()}\n// Blog posts metadata\n// Do not edit by hand.\n\nconst blogPosts = ${JSON.stringify(postsData, null, 2)};\n`,
      "utf8"
    );

    await fs.promises.writeFile(
      path.join(DATA_DIR, "blog-posts.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), posts: postsData }, null, 2) + "\n",
      "utf8"
    );

    // Generate HTML files for each post
    console.log("\n📄 Generating HTML files...");
    for (const post of posts) {
      const slug = post.slug || slugify(post.title || "");
      const filename = `${slug}.html`;
      const filepath = path.join(BLOG_POSTS_DIR, filename);
      const html = generatePostHTML(post, posts);
      await fs.promises.writeFile(filepath, html, "utf8");
      console.log(`   ✅ ${filename}`);
    }

    // Sort posts by publish date (newest first)
    posts.sort((a, b) => {
      const dateA = new Date(a.publishDate || 0);
      const dateB = new Date(b.publishDate || 0);
      return dateB - dateA;
    });

    // Generate blog index page
    console.log("\n📋 Generating blog index page...");
    const indexHTML = generateBlogIndexHTML(posts);
    await fs.promises.writeFile(path.join(BLOG_DIR, "index.html"), indexHTML, "utf8");
    console.log("   ✅ blog/index.html");

    console.log(`\n✅ Blog sync complete!`);
    console.log(`   Posts: ${posts.length}`);
    console.log(`   Output: ${BLOG_DIR}`);
  } catch (err) {
    console.error("\n❌ Blog sync failed:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});

