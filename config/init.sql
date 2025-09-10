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
CREATE INDEX IF NOT EXISTS idx_store_product ON price_data (store_name, product_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_product_search ON price_data (product_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_category ON price_data (product_category, time DESC);
CREATE INDEX IF NOT EXISTS idx_recent_prices ON price_data (time DESC) WHERE time > NOW() - INTERVAL '7 days';

-- Create view for latest prices
CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (store_name, product_name)
    store_name,
    product_name,
    product_weight,
    product_unit,
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
CREATE INDEX IF NOT EXISTS idx_daily_avg ON daily_average_prices (product_name, day DESC);

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

-- Sample data is now loaded separately via API collectors
-- Use seed.js or collectors to populate real data






