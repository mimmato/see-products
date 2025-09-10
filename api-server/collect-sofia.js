/* Collector that ingests products from StefanBratanov/sofia-supermarkets-api */
const axios = require('axios');
require('dotenv').config();

// Shared utilities
const { query, closeDB } = require('./utils/database');
const { normalizeProduct } = require('./utils/productParser');

const API_URL = process.env.SOFIA_API_URL || 'http://localhost:8080';
// Endpoint expected to return an array of products across stores
// You can set SOFIA_API_ENDPOINT to override the path (e.g., '/products')
const API_ENDPOINT = process.env.SOFIA_API_ENDPOINT || '/products';

// Mappings for field names; supports fallbacks
const FIELD_STORE = process.env.SOFIA_FIELD_STORE || 'storeName';
const FIELD_NAME = process.env.SOFIA_FIELD_NAME || 'name';
const FIELD_CATEGORY = process.env.SOFIA_FIELD_CATEGORY || 'category';
// Will try these in order for price
const FIELD_PRICE_CANDIDATES = (process.env.SOFIA_FIELD_PRICE_LIST || 'price,currentPrice,finalPrice')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);


async function save(product) {
  const normalized = normalizeProduct(product, {
    storeField: [FIELD_STORE, 'store', 'store_name'],
    nameField: [FIELD_NAME, 'productName', 'title'],
    categoryField: [FIELD_CATEGORY, 'productCategory'],
    priceField: FIELD_PRICE_CANDIDATES,
    oldPriceField: ['oldPrice', 'previousPrice', 'originalPrice'],
    urlField: ['url', 'productUrl', 'link'],
    imageField: ['image', 'imageUrl', 'picUrl', 'img']
  });
  
  if (!normalized) return; // skip invalid products
  
  await query(
    `INSERT INTO price_data (
      store_name, product_name, product_brand, product_weight, product_unit, 
      product_category, price, old_price, currency, product_url, image_url, 
      in_stock, time
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
    [
      normalized.store_name, 
      normalized.product_name, 
      normalized.product_brand,
      normalized.product_weight,
      normalized.product_unit,
      normalized.product_category, 
      normalized.price, 
      normalized.old_price,
      normalized.currency, 
      normalized.product_url, 
      normalized.image_url,
      normalized.in_stock
    ]
  );
}

async function run() {
  const url = API_URL.replace(/\/$/, '') + API_ENDPOINT + '?offers=false';
  console.log(`Fetching from: ${url}`);
  const { data } = await axios.get(url, { headers: { 'User-Agent': 'PriceTracker/1.0' }, timeout: 30000 });
  if (!Array.isArray(data)) throw new Error('Unexpected response; expected array');
  console.log(`Found ${data.length} stores with products`);
  
  for (const storeData of data) {
    console.log(`Processing store: ${storeData.supermarket} with ${storeData.products?.length || 0} products`);
    if (storeData.products && Array.isArray(storeData.products)) {
      for (const product of storeData.products) {
        // Create a flattened product object
        const flatProduct = {
          storeName: storeData.supermarket,
          name: product.name,
          category: product.category,
          price: product.price,
          oldPrice: product.oldPrice,
          url: null, // Sofia API doesn't provide product URLs
          image: product.picUrl || product.imageUrl || product.img
        };
        // eslint-disable-next-line no-await-in-loop
        await save(flatProduct);
      }
    }
  }
}

if (require.main === module) {
  run()
    .then(async () => {
      // eslint-disable-next-line no-console
      console.log('Sofia API collection completed');
      await closeDB();
    })
    .catch(async err => {
      // eslint-disable-next-line no-console
      console.error('Sofia API collection failed:', err.message);
      await closeDB();
      process.exit(1);
    });
}






