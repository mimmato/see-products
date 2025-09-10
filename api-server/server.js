const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

// Shared utilities
const { query, closeDB } = require('./utils/database');
const { asyncHandler, sendError, sendSuccess, globalErrorHandler } = require('./utils/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection is now handled by shared utilities

// Health endpoint
app.get('/api/health', asyncHandler(async (req, res) => {
  const result = await query('SELECT NOW() as now');
  sendSuccess(res, { now: result.rows[0].now }, 'Database connection healthy');
}));

// List distinct products for suggestions
app.get('/api/products', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT product_name AS name, COALESCE(product_category, '') AS category
     FROM (
       SELECT DISTINCT product_name, product_category
       FROM price_data
       WHERE product_name IS NOT NULL
     ) t
     ORDER BY name ASC
     LIMIT 500`
  );
  sendSuccess(res, rows);
}));

// Search product suggestions by keyword
app.get('/api/search/suggestions', asyncHandler(async (req, res) => {
  const searchQuery = req.query.q || '';
  if (searchQuery.length < 2) {
    return sendSuccess(res, []);
  }
  
  const { rows } = await query(
    `SELECT DISTINCT product_name AS name, 
            COALESCE(product_category, '') AS category,
            COUNT(*) as store_count
     FROM price_data 
     WHERE product_name ILIKE '%' || $1 || '%'
     GROUP BY product_name, product_category
     ORDER BY store_count DESC, product_name ASC
     LIMIT 20`,
    [searchQuery]
  );
  sendSuccess(res, rows);
}));

// Latest prices endpoint
app.get('/api/prices/latest', asyncHandler(async (req, res) => {
  const product = req.query.product || '';
  const { rows } = await query(
    `SELECT store_name, product_name, product_weight, product_unit, price, old_price as previous_price, time, product_url, image_url
     FROM latest_prices
     WHERE product_name ILIKE '%' || $1 || '%'`,
    [product]
  );
  sendSuccess(res, rows);
}));

// Price history endpoint (last N days)
app.get('/api/prices/history', asyncHandler(async (req, res) => {
  const product = req.query.product || '';
  const days = Math.max(1, Math.min(90, parseInt(req.query.days || '30', 10)));
  const { rows } = await query(
    `SELECT to_char(day, 'YYYY-MM-DD') as day, store_name, product_name, product_category,
            avg_price, min_price, max_price, price_points
     FROM daily_average_prices
     WHERE product_name ILIKE '%' || $1 || '%'
       AND day >= CURRENT_DATE - $2::interval
     ORDER BY day ASC`,
    [product, `${days} days`]
  );
  sendSuccess(res, rows);
}));

// Price comparison endpoint
app.get('/api/prices/compare', asyncHandler(async (req, res) => {
  const product = req.query.product || '';
  const { rows } = await query(
    `SELECT store_name,
            current_price as today,
            yesterday_price as yesterday,
            week_ago_price as week_avg,
            month_ago_price as month_avg,
            price_trend as trend
     FROM get_price_comparison($1)`,
    [product]
  );
  sendSuccess(res, rows);
}));

// Latest prices with time period filtering
app.get('/api/prices/period/:period', asyncHandler(async (req, res) => {
  const product = req.query.product || '';
  const period = req.params.period;
  
  let dateCondition = '';
  let params = [product];
  
  switch (period) {
    case 'today':
      dateCondition = 'AND time::date = CURRENT_DATE';
      break;
    case 'yesterday':
      dateCondition = 'AND time::date = CURRENT_DATE - 1';
      break;
    case 'week':
      dateCondition = 'AND time >= date_trunc(\'week\', CURRENT_DATE)';
      break;
    case 'month':
      dateCondition = 'AND time >= date_trunc(\'month\', CURRENT_DATE)';
      break;
    case 'year':
      dateCondition = 'AND time >= date_trunc(\'year\', CURRENT_DATE)';
      break;
    default:
      dateCondition = 'AND time::date = CURRENT_DATE';
  }
  
  const { rows } = await query(
    `SELECT DISTINCT ON (store_name, product_name)
            store_name,
            product_name,
            product_weight,
            product_unit,
            price,
            old_price as previous_price,
            time,
            product_url,
            image_url
     FROM price_data
     WHERE product_name ILIKE '%' || $1 || '%'
       ${dateCondition}
     ORDER BY store_name, product_name, time DESC`,
    params
  );
  sendSuccess(res, rows);
}));

// Get all stores
app.get('/api/stores', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT store_name as name, COUNT(*) as product_count
     FROM price_data
     WHERE store_name IS NOT NULL
     GROUP BY store_name
     ORDER BY product_count DESC`
  );
  sendSuccess(res, rows);
}));

// Get discounted products for a specific store
app.get('/api/stores/:store/discounts', asyncHandler(async (req, res) => {
  const store = req.params.store || '';
  const { rows } = await query(
    `SELECT DISTINCT ON (product_name) 
            product_name,
            product_weight,
            product_unit,
            price,
            old_price,
            ROUND((old_price - price) / old_price * 100, 1) as discount_percentage,
            product_category,
            product_url,
            image_url
     FROM price_data
     WHERE store_name ILIKE $1 
       AND old_price IS NOT NULL 
       AND old_price > price
       AND price > 0
     ORDER BY product_name, time DESC
     LIMIT 50`,
    [store]
  );
  sendSuccess(res, rows);
}));

// Get statistics for a product
app.get('/api/statistics', asyncHandler(async (req, res) => {
  const product = req.query.product || '';
  const { rows } = await query(
    `SELECT 
      ROUND(AVG(price), 2) as average_price,
      MIN(price) as min_price,
      MAX(price) as max_price,
      ROUND(MAX(price) - MIN(price), 2) as price_difference,
      COUNT(DISTINCT store_name) as store_count
     FROM latest_prices
     WHERE product_name ILIKE '%' || $1 || '%'`,
    [product]
  );
  sendSuccess(res, rows[0] || {});
}));

// Get popular products (most searched/available)
app.get('/api/products/popular', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT product_name as name,
            product_category as category,
            MIN(price) as min_price,
            COUNT(DISTINCT store_name) as store_count
     FROM price_data
     WHERE product_name IS NOT NULL
       AND price > 0
     GROUP BY product_name, product_category
     HAVING COUNT(DISTINCT store_name) >= 2
     ORDER BY store_count DESC, min_price ASC
     LIMIT 12`
  );
  sendSuccess(res, rows);
}));

// Manual trigger for brochure collection
app.post('/api/collect/brochures', asyncHandler(async (req, res) => {
  const { spawn } = require('child_process');
  
  // Run brochure collection asynchronously
  const collectionProcess = spawn('node', ['collect-brochures.js'], { 
    cwd: __dirname,
    detached: false
  });

  let output = '';
  let errors = '';

  collectionProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  collectionProcess.stderr.on('data', (data) => {
    errors += data.toString();
  });

  collectionProcess.on('exit', (code) => {
    if (code === 0) {
      console.log('Brochure collection completed successfully');
    } else {
      console.error('Brochure collection failed:', errors);
    }
  });

  sendSuccess(res, { 
    message: 'Brochure collection started',
    process_id: collectionProcess.pid
  }, 'Collection process initiated', 202);
}));

// Example placeholder cron job (e.g., to refresh materialized view daily)
cron.schedule('15 3 * * *', async () => {
  try {
    // Run collectors
    const { spawn } = require('child_process');
    const runScript = (file) => new Promise((resolve, reject) => {
      const p = spawn('node', [file], { cwd: __dirname, stdio: 'inherit' });
      p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${file} exit ${code}`))));
    });
    await runScript('collect-sofia.js').catch(err => { console.error(err.message); });
    await runScript('collect.js').catch(err => { console.error(err.message); });
    await runScript('collect-brochures.js').catch(err => { console.error(err.message); });
    await query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_average_prices');
    // eslint-disable-next-line no-console
    console.log('[cron] Collection done. Refreshed daily_average_prices');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cron] Refresh failed:', err.message);
  }
});

// Add global error handler
app.use(globalErrorHandler);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on port ${PORT}`);
});


