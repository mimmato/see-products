/* Simple collector scaffold: fetches configured product URLs and writes to price_data */
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();

// Shared utilities
const { query, closeDB } = require('./utils/database');
const { parsePrice, normalizeProduct } = require('./utils/productParser');

const CONFIG_PATH = process.env.COLLECT_CONFIG || './collect.config.json';

async function loadConfig() {
  const text = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(text);
}


async function scrapeProduct(store, product) {
  const res = await axios.get(product.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = res.data;
  const $ = cheerio.load(html);
  const priceText = $(product.selectors.price).first().text().trim();
  const image = product.selectors.image ? $(product.selectors.image).attr('src') || '' : '';
  const price = await parsePrice(priceText);
  if (price == null) throw new Error(`${store.name} ${product.name} price parse error from '${priceText}'`);
  return { price, image };
}

async function savePrice(storeName, product) {
  try {
    const { price, image } = await scrapeProduct(storeName, product);
    await query(
      `INSERT INTO price_data (store_name, product_name, product_category, price, currency, product_url, image_url, time)
       VALUES ($1, $2, $3, $4, 'BGN', $5, $6, NOW())`,
      [storeName.name, product.name, product.category || null, price, product.url, image]
    );
    // eslint-disable-next-line no-console
    console.log(`[saved] ${storeName.name} | ${product.name} = ${price}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[error]', storeName.name, product.name, e.message);
  }
}

async function main() {
  const config = await loadConfig();
  for (const store of config.stores) {
    for (const product of store.products) {
      // eslint-disable-next-line no-await-in-loop
      await savePrice(store, product);
    }
  }
  await closeDB();
}

if (require.main === module) {
  main().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}


