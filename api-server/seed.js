require('dotenv').config();

// Shared utilities
const { query, closeDB } = require('./utils/database');

const products = [
  { name: 'Хляб Добруджа 650г', category: 'Хляб', prices: { Kaufland: 1.89, Billa: 2.19, Lidl: 1.99, Fantastico: 2.39 } },
  { name: 'Мляко 3.2% 1л', category: 'Мляко', prices: { Kaufland: 2.59, Billa: 2.69, Lidl: 2.49, Fantastico: 2.79 } },
  { name: 'Яйца L (10бр)', category: 'Яйца', prices: { Kaufland: 5.39, Billa: 5.79, Lidl: 5.29, Fantastico: 5.99 } },
  { name: 'Кашкавал 400г', category: 'Кашкавал', prices: { Kaufland: 8.99, Billa: 9.49, Lidl: 8.59, Fantastico: 9.99 } },
  { name: 'Олио 1л', category: 'Масла', prices: { Kaufland: 5.49, Billa: 5.59, Lidl: 5.39, Fantastico: 5.69 } },
  { name: 'Захар 1кг', category: 'Захарни', prices: { Kaufland: 2.29, Billa: 2.39, Lidl: 2.19, Fantastico: 2.49 } }
];

async function run() {
  try {
    for (const p of products) {
      for (const [store, price] of Object.entries(p.prices)) {
        await query(
          `INSERT INTO price_data (store_name, product_name, product_category, price, time)
           VALUES ($1, $2, $3, $4, NOW())`,
          [store, p.name, p.category, price]
        );
      }
    }
    console.log('Seed completed');
  } catch (e) {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

run();






