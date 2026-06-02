import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const landing = fs.readFileSync('src/components/layout/SeoLandingPage.tsx', 'utf8');
const generator = fs.readFileSync('scripts/generate_og_image.py', 'utf8');
const image = fs.readFileSync('public/og-image.png');

assert.match(index, /<meta property="og:image" content="https:\/\/pdfm\.ponslink\.com\/og-image\.png" \/>/, 'Open Graph image must use the PNG social thumbnail');
assert.match(index, /<meta property="og:image:type" content="image\/png" \/>/, 'Open Graph image must declare PNG type');
assert.match(index, /<meta property="og:image:width" content="1200" \/>/, 'Open Graph image width must be declared');
assert.match(index, /<meta property="og:image:height" content="630" \/>/, 'Open Graph image height must be declared');
assert.match(index, /<meta name="twitter:card" content="summary_large_image" \/>/, 'Twitter card must use a large image preview');
assert.match(index, /<meta name="twitter:image" content="https:\/\/pdfm\.ponslink\.com\/og-image\.png" \/>/, 'Twitter image must use the social thumbnail');
assert.match(index, /"image": "https:\/\/pdfm\.ponslink\.com\/og-image\.png"/, 'SoftwareApplication schema must expose the social image');
assert.match(landing, /upsertProperty\('og:image', imageUrl\)/, 'landing pages must update OG image at runtime');
assert.match(landing, /upsertMeta\('twitter:image', imageUrl\)/, 'landing pages must update Twitter image at runtime');
assert.match(generator, /1200, 630/, 'thumbnail generator must keep the recommended OG dimensions');

assert.equal(image.toString('ascii', 1, 4), 'PNG', 'og-image must be a PNG file');
const width = image.readUInt32BE(16);
const height = image.readUInt32BE(20);
assert.equal(width, 1200, 'og-image width must be 1200px');
assert.equal(height, 630, 'og-image height must be 630px');

console.log('seo thumbnail static contract passed');
