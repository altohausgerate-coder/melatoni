import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const sources = [
  'products-data.js',
  'markcross-products.js',
  'lm-meser-products.js',
  'melatoni-mini-products.js'
];
const context = vm.createContext({ window: { MELATONI_PRODUCTS: [] } });

for (const source of sources) {
  vm.runInContext(fs.readFileSync(path.join(root, source), 'utf8'), context, { filename: source });
}

const escapeXml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');
const updated = new Date().toISOString().slice(0, 10);
const staticUrls = [
  ['https://melatoni.com/', '1.0'],
  ['https://melatoni.com/products.html', '0.9'],
  ['https://melatoni.com/about.html', '0.5'],
  ['https://melatoni.com/contact.html', '0.5']
];
const productUrls = context.window.MELATONI_PRODUCTS
  .filter(item => item && item.id)
  .map(item => [`https://melatoni.com/product.html?id=${encodeURIComponent(item.id)}`, '0.8']);
const uniqueUrls = [...new Map([...staticUrls, ...productUrls].map(entry => [entry[0], entry])).values()];
const entries = uniqueUrls.map(([url, priority]) =>
  `  <url><loc>${escapeXml(url)}</loc><lastmod>${updated}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`
).join('\n');

fs.writeFileSync(
  path.join(root, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
);
console.log(`Generated sitemap.xml with ${uniqueUrls.length} URLs.`);
