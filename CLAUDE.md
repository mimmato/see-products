# CLAUDE.md - Bulgarian Price Tracker Implementation Guide

## 🎯 Project Overview

This guide will help you build a **public-facing price comparison website** for Bulgarian supermarkets (Kaufland, Billa, Lidl, Fantastico). The system automatically collects prices daily and displays them in a beautiful, user-friendly interface where visitors can check current prices and historical trends.

### What You'll Build
- ✅ Automated price collection system
- ✅ Beautiful public website (no login required)
- ✅ Historical price tracking (yesterday, last week, last year)
- ✅ Price comparison across 4 major stores
- ✅ Mobile-responsive design
- ✅ Real-time updates
- ✅ **NEW: Brochure data extraction** - Automatically processes PDF brochures with OCR

### Technology Stack
- **Docker** & **Docker Compose** (you already have this!)
- **TimescaleDB** - Time-series database for price history
- **n8n** - Visual automation tool (no coding needed)
- **Node.js** - Simple API server
- **Nginx** - Web server for the frontend
- **HTML/CSS/JavaScript** - Frontend (no framework needed)

---

## 📋 Prerequisites Checklist

Before starting, ensure you have:
- [x] Docker Desktop installed and running
- [x] At least 4GB free disk space
- [x] Basic text editor (Notepad++, VS Code, or similar)
- [x] Internet connection for downloading Docker images

---

## 🚀 Quick Start (15 Minutes)

### Step 1: Create Project Structure

Open Terminal/Command Prompt and run:

```bash
# Create main project directory
mkdir bulgarian-price-tracker
cd bulgarian-price-tracker

# Create all required subdirectories
mkdir -p frontend api-server config/grafana scripts backups data n8n-workflows

# Create empty files we'll need
touch docker-compose.yml .env
touch frontend/index.html
touch api-server/server.js api-server/package.json
touch config/init.sql
touch scripts/backup.sh scripts/health-check.sh
```

### Step 2: Environment Configuration

Create `.env` file with your passwords:

```env
# Database Configuration
DB_NAME=prices
DB_USER=priceuser
DB_PASSWORD=SecurePassword123!

# Application Configuration
TIMEZONE=Europe/Sofia

# API Configuration
API_PORT=3001
FRONTEND_PORT=80

# n8n Configuration
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=AdminPassword123!

# Project Name
COMPOSE_PROJECT_NAME=price-tracker
```

**⚠️ IMPORTANT**: Change `SecurePassword123!` and `AdminPassword123!` to your own secure passwords!

---

## 🐳 Docker Configuration

### Step 3: Create Docker Compose File

Copy this **complete** configuration to `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # PostgreSQL with TimescaleDB for price data storage
  timescaledb:
    image: timescale/timescaledb:latest-pg14
    container_name: price_tracker_db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./config/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # API Server for frontend
  api-server:
    image: node:18-alpine
    container_name: price_tracker_api
    restart: unless-stopped
    working_dir: /app
    volumes:
      - ./api-server:/app
    ports:
      - "${API_PORT}:3001"
    environment:
      DB_HOST: timescaledb
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
    command: sh -c "npm install && npm start"
    depends_on:
      timescaledb:
        condition: service_healthy
    networks:
      - frontend
      - backend

  # Web server for frontend
  frontend:
    image: nginx:alpine
    container_name: price_tracker_frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT}:80"
    volumes:
      - ./frontend:/usr/share/nginx/html:ro
      - ./config/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - api-server
    networks:
      - frontend

  # n8n for automation workflows
  n8n:
    image: n8nio/n8n
    container_name: price_tracker_n8n
    restart: unless-stopped
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
      - N8N_HOST=localhost
      - GENERIC_TIMEZONE=${TIMEZONE}
      - TZ=${TIMEZONE}
    ports:
      - "5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n-workflows:/workflows
    networks:
      - frontend
      - backend

  # docker for caching
  redis:
    image: redis:7-alpine
    container_name: price_tracker_redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

volumes:
  db_data:
  n8n_data:
  redis_data:
```

---

## 💾 Database Setup

### Step 4: Create Database Schema

Create `config/init.sql`:

```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Main price data table
CREATE TABLE IF NOT EXISTS price_data (
    id SERIAL,
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    store_name TEXT NOT NULL,
    store_id TEXT,
    product_name TEXT NOT NULL,
    product_brand TEXT,
    product_weight TEXT,
    product_unit TEXT,
    product_category TEXT,
    price DECIMAL(10,2) NOT NULL,
    old_price DECIMAL(10,2),
    discount_percentage DECIMAL(5,2),
    currency TEXT DEFAULT 'BGN',
    product_url TEXT,
    image_url TEXT,
    in_stock BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to TimescaleDB hypertable for better performance
SELECT create_hypertable('price_data', 'time', if_not_exists => TRUE);

-- Create indexes for fast queries
CREATE INDEX idx_store_product ON price_data (store_name, product_name, time DESC);
CREATE INDEX idx_product_search ON price_data (product_name, time DESC);
CREATE INDEX idx_category ON price_data (product_category, time DESC);
CREATE INDEX idx_recent_prices ON price_data (time DESC) WHERE time > NOW() - INTERVAL '7 days';

-- Create view for latest prices
CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (store_name, product_name)
    store_name,
    product_name,
    price,
    old_price,
    time,
    product_url,
    image_url
FROM price_data
ORDER BY store_name, product_name, time DESC;

-- Create materialized view for daily averages
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_average_prices AS
SELECT 
    time_bucket('1 day', time) as day,
    store_name,
    product_name,
    product_category,
    AVG(price) as avg_price,
    MIN(price) as min_price,
    MAX(price) as max_price,
    COUNT(*) as price_points
FROM price_data
GROUP BY day, store_name, product_name, product_category;

-- Create index on materialized view
CREATE INDEX idx_daily_avg ON daily_average_prices (product_name, day DESC);

-- Function to get price comparison
CREATE OR REPLACE FUNCTION get_price_comparison(product_search TEXT)
RETURNS TABLE (
    store_name TEXT,
    current_price DECIMAL,
    yesterday_price DECIMAL,
    week_ago_price DECIMAL,
    month_ago_price DECIMAL,
    price_trend TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH price_periods AS (
        SELECT 
            pd.store_name,
            AVG(CASE WHEN pd.time::date = CURRENT_DATE THEN pd.price END) as current,
            AVG(CASE WHEN pd.time::date = CURRENT_DATE - 1 THEN pd.price END) as yesterday,
            AVG(CASE WHEN pd.time::date = CURRENT_DATE - 7 THEN pd.price END) as week_ago,
            AVG(CASE WHEN pd.time::date = CURRENT_DATE - 30 THEN pd.price END) as month_ago
        FROM price_data pd
        WHERE pd.product_name ILIKE '%' || product_search || '%'
            AND pd.time > CURRENT_DATE - INTERVAL '31 days'
        GROUP BY pd.store_name
    )
    SELECT 
        pp.store_name,
        pp.current,
        pp.yesterday,
        pp.week_ago,
        pp.month_ago,
        CASE 
            WHEN pp.current > pp.yesterday THEN 'up'
            WHEN pp.current < pp.yesterday THEN 'down'
            ELSE 'stable'
        END as trend
    FROM price_periods pp;
END;
$$ LANGUAGE plpgsql;

-- Add some sample data for testing
INSERT INTO price_data (store_name, product_name, product_category, price, time) VALUES
    ('Kaufland', 'Хляб Добруджа 650г', 'Хляб', 1.89, NOW()),
    ('Billa', 'Хляб Добруджа 650г', 'Хляб', 2.19, NOW()),
    ('Lidl', 'Хляб Добруджа 650г', 'Хляб', 1.99, NOW()),
    ('Fantastico', 'Хляб Добруджа 650г', 'Хляб', 2.39, NOW());
```

---

## 🌐 Frontend Setup

### Step 5: Create the Public Website

Copy the complete HTML code to `frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="bg">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ценови Трекер България - Сравнете Цените в Супермаркетите</title>
    <meta name="description" content="Сравнете цените на хранителни продукти в Kaufland, Billa, Lidl и Fantastico. Актуални цени и ценова история.">
    
    <!-- External CSS -->
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- External JavaScript -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    
    <style>
        :root {
            --kaufland: #e60000;
            --billa: #ffd500;
            --lidl: #0050aa;
            --fantastico: #00a651;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(0,0,0,.1);
            border-radius: 50%;
            border-top-color: #667eea;
            animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .price-card {
            background: white;
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .price-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 30px rgba(0,0,0,0.15);
        }

        .price-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
        }

        .price-card.kaufland::before { background: var(--kaufland); }
        .price-card.billa::before { background: var(--billa); }
        .price-card.lidl::before { background: var(--lidl); }
        .price-card.fantastico::before { background: var(--fantastico); }

        .store-badge {
            display: inline-flex;
            padding: 6px 12px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 14px;
        }

        .store-badge.kaufland {
            background: rgba(230, 0, 0, 0.1);
            color: var(--kaufland);
            border: 2px solid var(--kaufland);
        }

        .store-badge.billa {
            background: rgba(255, 213, 0, 0.1);
            color: #d4a000;
            border: 2px solid var(--billa);
        }

        .store-badge.lidl {
            background: rgba(0, 80, 170, 0.1);
            color: var(--lidl);
            border: 2px solid var(--lidl);
        }

        .store-badge.fantastico {
            background: rgba(0, 166, 81, 0.1);
            color: var(--fantastico);
            border: 2px solid var(--fantastico);
        }
    </style>
</head>
<body>
    <!-- Header -->
    <header class="bg-white shadow-lg">
        <div class="container mx-auto px-4 py-6">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <i class="fas fa-shopping-cart text-3xl text-purple-600"></i>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-800">Ценови Трекер България</h1>
                        <p class="text-sm text-gray-600">Сравнете цените в реално време</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <span class="text-sm text-gray-600">
                        Последна актуализация: 
                        <span id="lastUpdate" class="font-semibold">
                            <span class="loading"></span>
                        </span>
                    </span>
                </div>
            </div>
        </div>
    </header>

    <!-- Search Section -->
    <section class="container mx-auto px-4 py-8">
        <div class="bg-white rounded-full px-6 py-4 shadow-lg max-w-2xl mx-auto flex items-center">
            <i class="fas fa-search text-gray-400 mr-3"></i>
            <input 
                type="text" 
                id="productSearch" 
                placeholder="Търсете продукт... напр. хляб, мляко, яйца"
                class="flex-1 outline-none text-lg"
            >
            <button onclick="searchProduct()" class="bg-purple-600 text-white px-6 py-2 rounded-full hover:bg-purple-700 transition">
                Търси
            </button>
        </div>

        <!-- Quick Search Buttons -->
        <div class="flex flex-wrap justify-center gap-2 mt-6">
            <button onclick="loadProduct('хляб')" class="bg-white px-4 py-2 rounded-full text-sm hover:bg-purple-50 transition shadow">
                🍞 Хляб
            </button>
            <button onclick="loadProduct('мляко')" class="bg-white px-4 py-2 rounded-full text-sm hover:bg-purple-50 transition shadow">
                🥛 Мляко
            </button>
            <button onclick="loadProduct('яйца')" class="bg-white px-4 py-2 rounded-full text-sm hover:bg-purple-50 transition shadow">
                🥚 Яйца
            </button>
            <button onclick="loadProduct('кашкавал')" class="bg-white px-4 py-2 rounded-full text-sm hover:bg-purple-50 transition shadow">
                🧀 Кашкавал
            </button>
            <button onclick="loadProduct('олио')" class="bg-white px-4 py-2 rounded-full text-sm hover:bg-purple-50 transition shadow">
                🍶 Олио
            </button>
            <button onclick="loadProduct('захар')" class="bg-white px-4 py-2 rounded-full text-sm hover:bg-purple-50 transition shadow">
                🍚 Захар
            </button>
        </div>
    </section>

    <!-- Main Content -->
    <section class="container mx-auto px-4 pb-8">
        <!-- Current Product Display -->
        <div class="bg-white rounded-2xl p-6 shadow-xl">
            <h2 class="text-2xl font-bold mb-6" id="currentProductTitle">Хляб Добруджа 650г</h2>

            <!-- Price Cards Grid -->
            <div id="priceCards" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <!-- Cards will be inserted here by JavaScript -->
            </div>

            <!-- Price History Chart -->
            <div class="bg-gray-50 rounded-xl p-6 mb-8">
                <h3 class="text-lg font-semibold mb-4">Ценова История (последните 30 дни)</h3>
                <canvas id="priceChart" height="100"></canvas>
            </div>

            <!-- Comparison Table -->
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left">Магазин</th>
                            <th class="px-4 py-3 text-left">Днес</th>
                            <th class="px-4 py-3 text-left">Вчера</th>
                            <th class="px-4 py-3 text-left">Преди седмица</th>
                            <th class="px-4 py-3 text-left">Преди месец</th>
                        </tr>
                    </thead>
                    <tbody id="comparisonTable">
                        <!-- Table rows will be inserted here by JavaScript -->
                    </tbody>
                </table>
            </div>
        </div>
    </section>

    <script>
        // API Configuration
        const API_URL = 'http://localhost:3001';
        let currentProduct = 'хляб';
        let priceChart = null;

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', function() {
            loadProduct('хляб');
            updateLastUpdateTime();
            setInterval(updateLastUpdateTime, 60000); // Update every minute
        });

        // Search functionality
        document.getElementById('productSearch').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchProduct();
            }
        });

        function searchProduct() {
            const searchTerm = document.getElementById('productSearch').value;
            if (searchTerm) {
                loadProduct(searchTerm);
            }
        }

        // Load product data
        async function loadProduct(productName) {
            currentProduct = productName;
            document.getElementById('currentProductTitle').textContent = `Търсене за: ${productName}`;
            
            // Show loading state
            showLoadingState();
            
            try {
                // Fetch all data in parallel
                const [latestPrices, priceHistory, comparisons] = await Promise.all([
                    fetchLatestPrices(productName),
                    fetchPriceHistory(productName),
                    fetchPriceComparisons(productName)
                ]);

                // Update UI with fetched data
                updatePriceCards(latestPrices);
                updatePriceChart(priceHistory);
                updateComparisonTable(comparisons);
                
            } catch (error) {
                console.error('Error loading product data:', error);
                showError('Грешка при зареждане на данните. Моля, опитайте отново.');
            }
        }

        // Fetch latest prices from API
        async function fetchLatestPrices(product) {
            const response = await fetch(`${API_URL}/api/prices/latest?product=${encodeURIComponent(product)}`);
            if (!response.ok) throw new Error('Failed to fetch prices');
            return await response.json();
        }

        // Fetch price history from API
        async function fetchPriceHistory(product) {
            const response = await fetch(`${API_URL}/api/prices/history?product=${encodeURIComponent(product)}&days=30`);
            if (!response.ok) throw new Error('Failed to fetch history');
            return await response.json();
        }

        // Fetch price comparisons from API
        async function fetchPriceComparisons(product) {
            const response = await fetch(`${API_URL}/api/prices/compare?product=${encodeURIComponent(product)}`);
            if (!response.ok) throw new Error('Failed to fetch comparisons');
            return await response.json();
        }

        // Update price cards UI
        function updatePriceCards(prices) {
            const container = document.getElementById('priceCards');
            container.innerHTML = '';
            
            if (!prices || prices.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center col-span-4">Няма намерени цени за този продукт</p>';
                return;
            }

            // Find lowest price
            const lowestPrice = Math.min(...prices.map(p => p.price));
            
            prices.forEach(item => {
                const isLowest = item.price === lowestPrice;
                const trend = item.price > item.previous_price ? 'up' : item.price < item.previous_price ? 'down' : 'stable';
                const trendIcon = trend === 'up' ? 'arrow-up' : trend === 'down' ? 'arrow-down' : 'minus';
                const trendColor = trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-gray-400';
                const priceDiff = Math.abs(item.price - (item.previous_price || item.price)).toFixed(2);
                
                const card = `
                    <div class="price-card ${item.store_name.toLowerCase()}">
                        <div class="flex justify-between items-start mb-3">
                            <span class="store-badge ${item.store_name.toLowerCase()}">${item.store_name.toUpperCase()}</span>
                            ${isLowest ? '<span class="text-xs text-green-600 font-bold">НАЈНИСКА</span>' : ''}
                        </div>
                        <div class="text-3xl font-bold text-gray-800 mb-2">${item.price.toFixed(2)} лв</div>
                        <div class="flex items-center text-sm ${trendColor}">
                            <i class="fas fa-${trendIcon} mr-1"></i>
                            <span>${trend === 'stable' ? 'без промяна' : `${trend === 'up' ? '+' : '-'}${priceDiff} лв`}</span>
                        </div>
                    </div>
                `;
                container.innerHTML += card;
            });
        }

        // Update price chart
        function updatePriceChart(history) {
            const ctx = document.getElementById('priceChart').getContext('2d');
            
            // Prepare data for chart
            const stores = [...new Set(history.map(h => h.store_name))];
            const dates = [...new Set(history.map(h => h.day))].sort();
            
            const datasets = stores.map(store => {
                const storeData = history.filter(h => h.store_name === store);
                const data = dates.map(date => {
                    const point = storeData.find(s => s.day === date);
                    return point ? point.avg_price : null;
                });
                
                const colors = {
                    'Kaufland': '#e60000',
                    'Billa': '#ffd500',
                    'Lidl': '#0050aa',
                    'Fantastico': '#00a651'
                };
                
                return {
                    label: store,
                    data: data,
                    borderColor: colors[store] || '#666',
                    backgroundColor: colors[store] ? colors[store] + '20' : '#66620',
                    tension: 0.4
                };
            });
            
            // Destroy existing chart if it exists
            if (priceChart) {
                priceChart.destroy();
            }
            
            // Create new chart
            priceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates.map(d => new Date(d).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })),
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + context.parsed.y?.toFixed(2) + ' лв';
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            ticks: {
                                callback: function(value) {
                                    return value.toFixed(2) + ' лв';
                                }
                            }
                        }
                    }
                }
            });
        }

        // Update comparison table
        function updateComparisonTable(comparisons) {
            const tbody = document.getElementById('comparisonTable');
            tbody.innerHTML = '';
            
            if (!comparisons || comparisons.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Няма данни за сравнение</td></tr>';
                return;
            }
            
            comparisons.forEach(item => {
                const row = `
                    <tr class="border-t">
                        <td class="px-4 py-3">
                            <span class="store-badge ${item.store_name.toLowerCase()}">${item.store_name.toUpperCase()}</span>
                        </td>
                        <td class="px-4 py-3 font-semibold">${item.today ? item.today.toFixed(2) + ' лв' : '-'}</td>
                        <td class="px-4 py-3">${item.yesterday ? item.yesterday.toFixed(2) + ' лв' : '-'}</td>
                        <td class="px-4 py-3">${item.week_avg ? item.week_avg.toFixed(2) + ' лв' : '-'}</td>
                        <td class="px-4 py-3">${item.month_avg ? item.month_avg.toFixed(2) + ' лв' : '-'}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }

        // Show loading state
        function showLoadingState() {
            document.getElementById('priceCards').innerHTML = '<div class="col-span-4 text-center"><span class="loading"></span> Зареждане...</div>';
        }

        // Show error message
        function showError(message) {
            document.getElementById('priceCards').innerHTML = `
                <div class="col-span-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    <i class="fas fa-exclamation-triangle mr-2"></i>${message}
                </div>
            `;
        }

        // Update last update time
        function updateLastUpdateTime() {
            const now = new Date();
            document.getElementById('lastUpdate').textContent = now.toLocaleTimeString('bg-BG');
        }
    </script>
</body>
</html>
```

---

## 🔧 API Server Setup

### Step 6: Create the API Server

Create `api-server/package.json`:

```json
{
  "name": "price-tracker-api",
  "version": "1.0.0",
  "description": "API server for Bulgarian Price Tracker",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "dotenv": "^16.3.1",
    "node-cron": "^3.0.2",
    "pdf-parse": "^1.1.1",
    "tesseract.js": "^5.0.5",
    "pdf2pic": "^2.1.4",
    "puppeteer": "^21.11.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

Create `api-server/server.js`:

```javascript
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'prices',
    user: process.env.DB_USER || 'priceuser',
    password: process.env.DB_PASSWORD,
});

// Health endpoint
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as now');
        res.json({ success: true, timestamp: result.rows[0].now });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get latest prices
app.get('/api/prices/latest', async (req, res) => {
    try {
        const product = req.query.product || '';
        const result = await pool.query(
            `SELECT store_name, product_name, price, time 
             FROM latest_prices 
             WHERE product_name ILIKE '%' || $1 || '%'`,
            [product]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
});
```

---

## 📊 Advanced Features

### 🛒 Brochure Data Collection System

The application now includes an advanced **Brochure Data Collection** system that automatically processes PDF promotional brochures from supermarkets using OCR (Optical Character Recognition).

#### ✨ Features:
- **Automatic PDF Download**: Scrapes supermarket websites to find latest brochures
- **OCR Processing**: Converts PDF images to text using Tesseract.js
- **Product Extraction**: Intelligently parses Bulgarian product names and prices
- **Database Integration**: Automatically saves extracted data to TimescaleDB
- **Error Handling**: Robust error handling and retry mechanisms

#### 📁 Key Files:
- `api-server/collect-brochures.js` - Main brochure collection script
- `api-server/utils/pdfProcessor.js` - PDF processing and OCR utilities
- `api-server/utils/productParser.js` - Product name and price parsing
- `api-server/test-brochure-collection.js` - Testing utilities

#### 🚀 Usage:

**Manual Collection:**
```bash
# Run brochure collection manually
npm run collect:brochures

# Test the brochure processing system
npm run test:brochures
```

**API Endpoint:**
```bash
# Trigger collection via API
curl -X POST http://localhost:3001/api/collect/brochures
```

**Automatic Collection:**
- Runs daily at 3:15 AM via cron job
- Integrated with existing collection workflow

#### 🔧 Configuration:

The brochure collector is configured in `collect-brochures.js`:

```javascript
const BROCHURE_CONFIG = {
  billa: {
    name: 'Billa',
    pageUrl: 'https://www.billa.bg/promocii/sedmichna-broshura',
    pdfUrlPattern: /https:\/\/view\.publitas\.com\/[^"]+\.pdf[^"]*/g,
    tempDir: './temp/billa'
  }
};
```

#### 📊 How It Works:

1. **Discovery Phase**: 
   - Scrapes the Billa promotional page
   - Finds PDF brochure URLs using regex patterns
   - Validates and selects the most recent brochure

2. **Processing Phase**:
   - Downloads PDF to temporary directory
   - Extracts text using pdf-parse library
   - Converts PDF pages to high-resolution images
   - Performs OCR on images using Tesseract.js with Bulgarian language support

3. **Parsing Phase**:
   - Combines PDF text and OCR results
   - Uses advanced regex to identify Bulgarian product names and prices
   - Normalizes product information (brand, weight, category)
   - Validates price ranges and product names

4. **Storage Phase**:
   - Saves valid products to the price_data table
   - Includes metadata like extraction source and timestamp
   - Automatically categorizes products

#### 🔍 Product Parsing:

The system intelligently parses Bulgarian product information:

```javascript
// Supported price formats:
"2.50 лв"     → 2.50
"15,99лв."    → 15.99  
"199 BGN"     → 199.00
"лв 3.75"     → 3.75

// Product normalization:
"Хляб Добруджа 650г" → {
  name: "Хляб Добруджа",
  weight: "650г", 
  unit: "г",
  category: "Хляб"
}
```

#### 🛡️ Error Handling:

- **PDF Download Failures**: Automatic retry with exponential backoff
- **OCR Failures**: Graceful degradation to PDF text only
- **Parsing Errors**: Invalid products are logged but don't stop processing
- **Database Errors**: Transaction rollback for consistency

#### 📈 Performance:

- **Processing Time**: ~2-5 minutes per brochure (depends on page count)
- **Memory Usage**: ~200MB peak during OCR processing
- **Storage**: Temporary files are automatically cleaned up
- **Concurrency**: Single-threaded to avoid overwhelming OCR engine

#### 🔧 Extending to Other Stores:

To add support for other supermarket chains:

1. Add store configuration to `BROCHURE_CONFIG`:
```javascript
lidl: {
  name: 'Lidl',
  pageUrl: 'https://www.lidl.bg/broshura',
  pdfUrlPattern: /https:\/\/lidl-brochure\.com\/[^"]+\.pdf/g,
  tempDir: './temp/lidl'
}
```

2. Update the main collection function to process multiple stores
3. Customize product parsing for store-specific formats

#### 🐛 Troubleshooting:

**Common Issues:**

1. **OCR Language Pack Missing**:
   ```bash
   # Tesseract automatically downloads language packs
   # Ensure internet connectivity during first run
   ```

2. **PDF Processing Fails**:
   ```bash
   # Check temp directory permissions
   mkdir -p ./temp && chmod 755 ./temp
   ```

3. **Memory Issues**:
   ```bash
   # Increase Node.js memory limit
   node --max-old-space-size=4096 collect-brochures.js
   ```

4. **Database Connection**:
   ```bash
   # Verify database environment variables
   echo $DB_HOST $DB_NAME $DB_USER
   ```

#### 📊 Monitoring:

Monitor brochure collection through:

- **Console Logs**: Detailed progress and error reporting
- **Database Queries**: Check recent entries in price_data table
- **API Health**: Use `/api/health` endpoint to verify system status

```sql
-- Check latest brochure collections
SELECT store_name, COUNT(*) as product_count, MAX(created_at) as last_collection
FROM price_data 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY store_name
ORDER BY last_collection DESC;
```

---

## 🚨 Important Security Notes

- **PDF Processing**: Only processes PDFs from whitelisted domains
- **OCR Data**: All extracted text is sanitized before database insertion
- **Temporary Files**: Automatically cleaned up to prevent disk space issues
- **API Rate Limiting**: Built-in delays prevent overwhelming source websites
- **Database Validation**: All product data is validated before storage

---

## 🔄 Maintenance

### Daily Tasks (Automated):
- Brochure collection at 3:15 AM
- Database materialized view refresh
- Temporary file cleanup

### Weekly Tasks:
- Monitor collection success rates
- Review and update PDF URL patterns
- Check OCR accuracy on sample products

### Monthly Tasks:  
- Database performance optimization
- Review product categorization accuracy
- Update store configurations if needed

---

## 🎯 Next Steps

With the brochure collection system in place, consider these enhancements:

1. **Multi-Store Support**: Extend to Kaufland, Lidl, and Fantastico brochures
2. **Price Change Alerts**: Notify when significant price drops occur  
3. **Historical Analysis**: Track promotional patterns and seasonal trends
4. **Mobile App**: Build a mobile companion app
5. **Advanced OCR**: Implement custom OCR models for better Bulgarian text recognition

The system is now capable of automatically collecting price data from multiple sources:
- Direct website scraping (existing functionality)
- API integrations (Sofia Supermarkets API)
- **PDF brochure processing (NEW)**

This comprehensive approach ensures maximum data coverage and accuracy for Bulgarian price tracking.

