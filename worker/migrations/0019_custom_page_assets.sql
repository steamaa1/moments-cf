-- Custom pages: per-page CSS/JS assets injected on the public /<slug> page.
-- Admin-only: these are authored by the site admin, same trust level as the page body.
ALTER TABLE custom_pages ADD COLUMN custom_css TEXT NOT NULL DEFAULT '';
ALTER TABLE custom_pages ADD COLUMN custom_js TEXT NOT NULL DEFAULT '';
