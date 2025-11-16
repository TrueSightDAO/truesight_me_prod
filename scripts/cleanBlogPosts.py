#!/usr/bin/env python3
"""
Clean up blog post HTML files by removing Wix-specific markup and useless SVG files
"""

import os
import re
from pathlib import Path

BLOG_POSTS_DIR = Path(__file__).parent.parent / "blog" / "posts"

def clean_blog_post(html_path):
    """Clean a single blog post HTML file"""
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Remove nested Wix header (duplicate author info)
    content = re.sub(
        r'<div><header><div><div><div><ul><li>.*?</header>',
        '',
        content,
        flags=re.DOTALL
    )
    
    # Remove section with share buttons at the top
    # Match from <section><div><div><div> (opening share section) to </section> (closing)
    # But be careful not to remove content sections
    # Look for section with share buttons pattern
    content = re.sub(
        r'<section><div><div><div><button aria-label="Share via.*?</section>',
        '',
        content,
        flags=re.DOTALL
    )
    
    # Remove footer with share buttons, views, comments, like buttons
    # Match from <footer><div><div><section> to </footer> (but only the one inside blog-post-content)
    content = re.sub(
        r'<footer><div><div><section>.*?</section></div></div></footer>',
        '',
        content,
        flags=re.DOTALL
    )
    
    # Remove expand image buttons (various class names)
    content = re.sub(
        r'<button class="Uz933" type="button" aria-label="Expand image"><svg.*?</button>',
        '',
        content,
        flags=re.DOTALL
    )
    content = re.sub(
        r'<button class="wwXRO"[^>]*>.*?</button>',
        '',
        content,
        flags=re.DOTALL
    )
    # Remove buttons with svg inside that are expand/zoom buttons
    content = re.sub(
        r'<button[^>]*class="[^"]*[XxRrOo][^"]*"[^>]*><svg.*?</button>',
        '',
        content,
        flags=re.DOTALL
    )
    
    # Remove empty figure divs that only contained expand buttons
    content = re.sub(
        r'<figure><div><div[^>]*>.*?</div></div></figure>',
        lambda m: re.sub(r'<button.*?</button>', '', m.group(0), flags=re.DOTALL) if '<button' in m.group(0) else m.group(0),
        content,
        flags=re.DOTALL
    )
    
    # Remove empty footer elements
    content = re.sub(r'<footer><div></div></footer>', '', content)
    content = re.sub(r'<footer><div><div></div></div></footer>', '', content)
    
    # Remove empty elements that create white space
    # Remove empty paragraphs (with or without whitespace/br)
    content = re.sub(r'<p[^>]*>\s*</p>', '', content)
    content = re.sub(r'<p[^>]*>\s*<br>\s*</p>', '', content)
    content = re.sub(r'<p[^>]*>\s*<br\s*/?>\s*</p>', '', content)
    
    # Remove empty spans with just br
    content = re.sub(r'<span[^>]*>\s*<br>\s*</span>', '', content)
    content = re.sub(r'<span[^>]*>\s*<br\s*/?>\s*</span>', '', content)
    content = re.sub(r'<span[^>]*><br></span>', '', content)
    
    # Remove divs containing only empty spans with br
    content = re.sub(r'<div[^>]*>\s*<span[^>]*>\s*<br>\s*</span>\s*</div>', '', content)
    content = re.sub(r'<div[^>]*>\s*<span[^>]*>\s*<br\s*/?>\s*</span>\s*</div>', '', content)
    content = re.sub(r'<div[^>]*>\s*<span[^>]*><br></span>\s*</div>', '', content)
    
    # Remove nested divs with just empty spans/br
    content = re.sub(r'<div[^>]*><div[^>]*>\s*<span[^>]*>\s*<br>\s*</span>\s*</div></div>', '', content)
    content = re.sub(r'<div[^>]*><div[^>]*>\s*<span[^>]*>\s*<br\s*/?>\s*</span>\s*</div></div>', '', content)
    content = re.sub(r'<div[^>]*><div[^>]*dir="auto"[^>]*>\s*<span[^>]*><br></span>\s*</div></div>', '', content)
    
    # Clean up empty divs
    content = re.sub(r'<div></div>', '', content)
    content = re.sub(r'<div[^>]*>\s*</div>', '', content)
    
    # Simplify nested section/div structure
    # Replace <section><div><div><div> with just the content
    content = re.sub(
        r'<section><div><div><div>',
        '',
        content
    )
    content = re.sub(
        r'</section><footer><div></div></footer></div>',
        '',
        content
    )
    content = re.sub(
        r'</section></div>',
        '',
        content
    )
    
    # Clean up nested divs (be more careful)
    # Only simplify if we're sure it's safe
    for _ in range(5):  # Multiple passes for nested structures
        content = re.sub(r'<div><div>', '<div>', content)
        content = re.sub(r'</div></div>', '</div>', content)
    
    # Remove any remaining empty paragraphs and divs
    content = re.sub(r'<p[^>]*>\s*</p>', '', content)
    content = re.sub(r'<div[^>]*>\s*</div>', '', content)
    content = re.sub(r'<span[^>]*>\s*</span>', '', content)
    
    # Remove Wix-specific data attributes (but keep important ones like src, alt)
    content = re.sub(r'\s+data-ssr-src-done="[^"]*"', '', content)
    content = re.sub(r'\s+data-load-done="[^"]*"', '', content)
    content = re.sub(r'\s+data-pin-url="[^"]*"', '', content)
    content = re.sub(r'\s+data-pin-media="[^"]*"', '', content)
    content = re.sub(r'\s+data-rce-version="[^"]*"', '', content)
    content = re.sub(r'\s+data-content-hook="[^"]*"', '', content)
    content = re.sub(r'\s+data-hook="[^"]*"', '', content)
    
    # Remove Wix-specific classes
    content = re.sub(r'\s+class="[^"]*Uz933[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*cZKur[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*_3mPCj[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*uUNDj[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*hV4Sgn[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*swgwDTg[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*laz8E8[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*h7K_lu[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*G5Aa3J[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*YfFkQX[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*zkv91u[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*y5oGWU[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*Eu1LNI[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*PxeFnW[^"]*"', '', content)
    content = re.sub(r'\s+class="[^"]*X22cAo[^"]*"', '', content)
    
    # Remove role and aria attributes that are Wix-specific
    content = re.sub(r'\s+role="img"', '', content)
    content = re.sub(r'\s+aria-label="[^"]*Share via[^"]*"', '', content)
    content = re.sub(r'\s+aria-label="[^"]*Expand image[^"]*"', '', content)
    content = re.sub(r'\s+aria-label="[^"]*Print Post[^"]*"', '', content)
    content = re.sub(r'\s+aria-label="[^"]*Like post[^"]*"', '', content)
    content = re.sub(r'\s+aria-describedby="[^"]*"', '', content)
    content = re.sub(r'\s+aria-live="[^"]*"', '', content)
    content = re.sub(r'\s+aria-pressed="[^"]*"', '', content)
    content = re.sub(r'\s+aria-hidden="true"', '', content)
    content = re.sub(r'\s+aria-label="[^"]*views[^"]*"', '', content)
    content = re.sub(r'\s+aria-label="[^"]*comments[^"]*"', '', content)
    content = re.sub(r'\s+role="status"', '', content)
    content = re.sub(r'\s+title=""', '', content)
    content = re.sub(r'\s+draggable="false"', '', content)
    content = re.sub(r'\s+fetchpriority="[^"]*"', '', content)
    
    # Remove redundant images with empty alt attributes (often duplicates at the start)
    # Remove images wrapped in section tags with empty alt
    content = re.sub(r'<section><img alt=""[^>]*></section>', '', content)
    content = re.sub(r'<section><img alt=""[^>]*/></section>', '', content)
    # Remove standalone images with empty alt at the start of content
    content = re.sub(r'<img alt="" src="[^"]*">', '', content)
    content = re.sub(r'<img alt="" src="[^"]*"/>', '', content)
    
    # Remove empty spans
    content = re.sub(r'<span class="[^"]*"></span>', '', content)
    content = re.sub(r'<span></span>', '', content)
    
    # Remove empty buttons
    content = re.sub(r'<button[^>]*></button>', '', content)
    
    # Remove viewer IDs (Wix-specific)
    content = re.sub(r'\s+id="viewer-[^"]*"', '', content)
    content = re.sub(r'\s+id="more-button-[^"]*"', '', content)
    content = re.sub(r'\s+id="[^"]*-button-[^"]*"', '', content)
    
    # Clean up extra whitespace
    content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)
    
    if content != original_content:
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    """Process all blog post files"""
    blog_posts = list(BLOG_POSTS_DIR.glob("*.html"))
    
    print(f"Found {len(blog_posts)} blog post files")
    
    cleaned = 0
    for post_path in blog_posts:
        if clean_blog_post(post_path):
            cleaned += 1
            print(f"✓ Cleaned: {post_path.name}")
        else:
            print(f"- No changes: {post_path.name}")
    
    print(f"\n✓ Cleaned {cleaned} out of {len(blog_posts)} blog post files")

if __name__ == "__main__":
    main()

