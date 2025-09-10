/**
 * Billa Brochure Data Collector
 * Extracts product data from weekly promotional brochures
 */
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import utilities
const { query, closeDB } = require('./utils/database');
const { parsePrice, normalizeProduct, categorizeProduct } = require('./utils/productParser');
const { processBrochurePDF, processFlippingbookBrochure, parseProductsFromBrochureText } = require('./utils/pdfProcessor');

const BROCHURE_CONFIG = {
  billa: {
    name: 'Billa',
    pageUrl: 'https://www.billa.bg/promocii/sedmichna-broshura',
    pdfUrlPattern: /https:\/\/view\.publitas\.com\/[^"]+\.pdf[^"]*/g,
    tempDir: './temp/billa'
  },
  fantastico: {
    name: 'Fantastico',
    pageUrl: 'https://www.fantastico.bg/special-offers',
    pdfUrlPattern: /https:\/\/online\.flippingbook\.com\/view\/\d+\//g,
    tempDir: './temp/fantastico'
  }
};

/**
 * Find the latest brochure PDF URL from Fantastico's page
 * @returns {Promise<string>} PDF URL
 */
async function findLatestFantasticoBrochureUrl() {
  try {
    console.log('Fetching Fantastico brochure page...');
    const response = await axios.get(BROCHURE_CONFIG.fantastico.pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for PDF links in various possible locations
    const pdfUrls = [];
    
    // Search in link hrefs for Flippingbook URLs
    $('a[href*="flippingbook.com"], a[href*="special-offers"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        // Check if it's a flippingbook URL or brochure page that might contain one
        if (href.includes('flippingbook.com')) {
          pdfUrls.push(href);
        } else if (href.includes('broshura') || href.includes('fantastiko')) {
          // For brochure pages, we need to fetch them to find flippingbook links
          const brochurePageUrl = href.startsWith('http') ? href : 'https://www.fantastico.bg' + href;
          pdfUrls.push(brochurePageUrl);
        }
      }
    });
    
    // Search in data attributes for flippingbook URLs
    $('[data-pdf], [data-url], [data-href]').each((i, el) => {
      const attrs = ['data-pdf', 'data-url', 'data-href'];
      attrs.forEach(attr => {
        const url = $(el).attr(attr);
        if (url && url.includes('flippingbook.com')) {
          pdfUrls.push(url);
        }
      });
    });

    // Search in script tags for embedded URLs
    $('script').each((i, el) => {
      const scriptContent = $(el).html() || '';
      const matches = scriptContent.match(BROCHURE_CONFIG.fantastico.pdfUrlPattern);
      if (matches) {
        pdfUrls.push(...matches);
      }
    });

    // Search entire page content for PDF URLs
    const pageText = response.data;
    const allMatches = pageText.match(BROCHURE_CONFIG.fantastico.pdfUrlPattern);
    if (allMatches) {
      pdfUrls.push(...allMatches);
    }

    // Remove duplicates and clean URLs
    const uniqueUrls = [...new Set(pdfUrls)].map(url => {
      // Clean and validate URL
      let cleanUrl = url.replace(/['"]/g, '');
      if (!cleanUrl.startsWith('http')) {
        cleanUrl = 'https://www.fantastico.bg' + cleanUrl;
      }
      return cleanUrl;
    });

    if (uniqueUrls.length === 0) {
      throw new Error('No brochure URLs found on Fantastico page');
    }

    console.log(`Found ${uniqueUrls.length} potential brochure URLs`);
    
    // Try to find Flippingbook URLs from brochure pages
    for (const url of uniqueUrls) {
      console.log('Checking URL:', url);
      
      if (url.includes('flippingbook.com')) {
        console.log('Found direct Flippingbook URL:', url);
        return url;
      }
      
      // If it's a brochure page, fetch it to find the Flippingbook URL
      if (url.includes('special-offers')) {
        try {
          const flippingbookUrl = await extractFlippingbookUrl(url);
          if (flippingbookUrl) {
            console.log('Found Flippingbook URL from page:', flippingbookUrl);
            return flippingbookUrl;
          }
        } catch (error) {
          console.log(`Failed to extract from ${url}:`, error.message);
        }
      }
    }
    
    throw new Error('No Flippingbook URLs found in brochure pages');

  } catch (error) {
    console.error('Error finding Fantastico brochure URL:', error.message);
    throw new Error(`Unable to find current brochure URL: ${error.message}`);
  }
}

/**
 * Extract Flippingbook URL from a Fantastico brochure page
 * @param {string} brochurePageUrl - URL to brochure page
 * @returns {Promise<string|null>} Flippingbook URL or null
 */
async function extractFlippingbookUrl(brochurePageUrl) {
  try {
    console.log(`Fetching brochure page: ${brochurePageUrl}`);
    const response = await axios.get(brochurePageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for Flippingbook URLs in various locations
    let flippingbookUrl = null;
    
    // Check links
    $('a[href*="flippingbook.com"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('online.flippingbook.com/view/')) {
        flippingbookUrl = href;
        return false; // Break the loop
      }
    });
    
    if (flippingbookUrl) return flippingbookUrl;
    
    // Check iframes
    $('iframe[src*="flippingbook.com"]').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('online.flippingbook.com/view/')) {
        flippingbookUrl = src;
        return false; // Break the loop
      }
    });
    
    if (flippingbookUrl) return flippingbookUrl;
    
    // Check entire page content for Flippingbook URLs
    const pageText = response.data;
    const flippingbookMatches = pageText.match(/https:\/\/online\.flippingbook\.com\/view\/\d+\//g);
    if (flippingbookMatches && flippingbookMatches.length > 0) {
      flippingbookUrl = flippingbookMatches[0];
    }
    
    return flippingbookUrl;
    
  } catch (error) {
    throw new Error(`Failed to fetch brochure page: ${error.message}`);
  }
}

/**
 * Find the latest brochure PDF URL from Billa's page
 * @returns {Promise<string>} PDF URL
 */
async function findLatestBillaBrochureUrl() {
  try {
    console.log('Fetching Billa brochure page...');
    const response = await axios.get(BROCHURE_CONFIG.billa.pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for PDF links in various possible locations
    const pdfUrls = [];
    
    // Search in link hrefs
    $('a[href*="publitas.com"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('.pdf')) {
        pdfUrls.push(href);
      }
    });
    
    // Search in data attributes
    $('[data-pdf], [data-url], [data-href]').each((i, el) => {
      const attrs = ['data-pdf', 'data-url', 'data-href'];
      attrs.forEach(attr => {
        const url = $(el).attr(attr);
        if (url && url.includes('publitas.com') && url.includes('.pdf')) {
          pdfUrls.push(url);
        }
      });
    });

    // Search in script tags for embedded URLs
    $('script').each((i, el) => {
      const scriptContent = $(el).html() || '';
      const matches = scriptContent.match(BROCHURE_CONFIG.billa.pdfUrlPattern);
      if (matches) {
        pdfUrls.push(...matches);
      }
    });

    // Search entire page content for PDF URLs
    const pageText = response.data;
    const allMatches = pageText.match(BROCHURE_CONFIG.billa.pdfUrlPattern);
    if (allMatches) {
      pdfUrls.push(...allMatches);
    }

    // Remove duplicates and clean URLs
    const uniqueUrls = [...new Set(pdfUrls)].map(url => {
      // Clean and validate URL
      let cleanUrl = url.replace(/['"]/g, '');
      if (!cleanUrl.startsWith('http')) {
        cleanUrl = 'https:' + cleanUrl;
      }
      return cleanUrl;
    });

    if (uniqueUrls.length === 0) {
      throw new Error('No PDF brochure URLs found on Billa page');
    }

    console.log(`Found ${uniqueUrls.length} potential brochure URLs`);
    console.log('Using URL:', uniqueUrls[0]);
    
    return uniqueUrls[0]; // Return the first/most recent one

  } catch (error) {
    console.error('Error finding Billa brochure URL:', error.message);
    // Fallback to a known recent URL format if available
    throw new Error(`Unable to find current brochure URL: ${error.message}`);
  }
}

/**
 * Process Fantastico brochure and extract products
 * @param {string} pdfUrl - URL to brochure PDF
 * @returns {Promise<Array>} Array of product objects
 */
async function processFantasticoBrochure(pdfUrl) {
  const tempDir = BROCHURE_CONFIG.fantastico.tempDir;
  
  console.log('Processing Fantastico brochure via Flippingbook...');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Process Flippingbook URL and extract text
    const { combinedText, pdfText, ocrResults } = await processFlippingbookBrochure(pdfUrl, tempDir);
    
    console.log('Extracted text length:', combinedText.length);
    console.log('Processing method: Flippingbook web scraping');
    
    // Parse products from the extracted text
    const products = parseProductsFromBrochureText(combinedText);
    
    console.log(`Found ${products.length} potential products`);
    
    // Filter and clean products
    const cleanedProducts = products
      .filter(product => {
        // Basic validation
        return product.name && 
               product.name.length > 2 && 
               product.price > 0 && 
               product.price < 500 && // Reasonable price range
               !/^(стр|page|реклама)/i.test(product.name); // Remove page indicators
      })
      .map(product => {
        // Normalize the product
        const normalized = normalizeProduct(product.name);
        return {
          ...product,
          ...normalized,
          category: categorizeProduct(product.name),
          source: 'brochure',
          store_name: 'Fantastico'
        };
      });

    console.log(`Cleaned to ${cleanedProducts.length} valid products`);
    
    return cleanedProducts;
    
  } catch (error) {
    console.error('Error processing Fantastico brochure:', error);
    throw error;
  }
}

/**
 * Process Billa brochure and extract products
 * @param {string} pdfUrl - URL to brochure PDF
 * @returns {Promise<Array>} Array of product objects
 */
async function processBillaBrochure(pdfUrl) {
  const tempDir = BROCHURE_CONFIG.billa.tempDir;
  
  console.log('Processing Billa brochure PDF...');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Process PDF and extract text
    const { combinedText, pdfText, ocrResults } = await processBrochurePDF(pdfUrl, tempDir);
    
    console.log('Extracted text length:', combinedText.length);
    console.log('OCR pages processed:', ocrResults.length);
    
    // Parse products from the extracted text
    const products = parseProductsFromBrochureText(combinedText);
    
    console.log(`Found ${products.length} potential products`);
    
    // Filter and clean products
    const cleanedProducts = products
      .filter(product => {
        // Basic validation
        return product.name && 
               product.name.length > 2 && 
               product.price > 0 && 
               product.price < 500 && // Reasonable price range
               !/^(стр|page|реклама)/i.test(product.name); // Remove page indicators
      })
      .map(product => {
        // Normalize the product
        const normalized = normalizeProduct(product.name);
        return {
          ...product,
          ...normalized,
          category: categorizeProduct(product.name),
          source: 'brochure',
          store_name: 'Billa'
        };
      });

    console.log(`Cleaned to ${cleanedProducts.length} valid products`);
    
    return cleanedProducts;
    
  } catch (error) {
    console.error('Error processing Billa brochure:', error);
    throw error;
  }
}

/**
 * Save products to database
 * @param {Array} products - Array of product objects
 */
async function saveProductsToDatabase(products) {
  console.log(`Saving ${products.length} products to database...`);
  
  let savedCount = 0;
  let errorCount = 0;

  for (const product of products) {
    try {
      await query(
        `INSERT INTO price_data (
          store_name, product_name, product_brand, product_weight, 
          product_unit, product_category, price, currency, 
          in_stock, time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'BGN', true, NOW())`,
        [
          product.store_name,
          product.name || product.originalName,
          product.brand || null,
          product.weight || null,
          product.unit || null,
          product.category,
          product.price
        ]
      );
      
      savedCount++;
      console.log(`[${savedCount}/${products.length}] Saved: ${product.name} - ${product.price} лв`);
      
    } catch (error) {
      errorCount++;
      console.error(`Error saving product "${product.name}":`, error.message);
    }
  }

  console.log(`\n✅ Collection Summary:`);
  console.log(`   Products saved: ${savedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Total processed: ${products.length}`);
}

/**
 * Check if brochure was already processed today
 * @param {string} storeName - Store name
 * @returns {Promise<boolean>} - True if already processed today
 */
async function wasProcessedToday(storeName) {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM price_data 
     WHERE store_name = $1 
       AND DATE(time) = CURRENT_DATE 
       AND created_at > NOW() - INTERVAL '1 day'`,
    [storeName]
  );
  
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Main collection function for Fantastico
 */
async function collectFantasticoBrochureData() {
  console.log('🛒 Starting Fantastico Brochure Collection...');
  console.log('================================================');
  
  try {
    // Check if already processed today
    const alreadyProcessed = await wasProcessedToday('Fantastico');
    if (alreadyProcessed) {
      console.log('ℹ️  Fantastico brochure already processed today. Skipping...');
      return;
    }

    // Find latest brochure URL
    const brochureUrl = await findLatestFantasticoBrochureUrl();
    
    // Process brochure and extract products
    const products = await processFantasticoBrochure(brochureUrl);
    
    if (products.length === 0) {
      console.log('⚠️  No products found in brochure');
      return;
    }

    // Save to database
    await saveProductsToDatabase(products);
    
    console.log('✅ Fantastico brochure collection completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in Fantastico brochure collection:', error);
    throw error;
  } finally {
    await closeDB();
  }
}

/**
 * Main collection function for all stores (without individual database closures)
 */
async function collectAllBrochureData() {
  console.log('🛒 Starting All Stores Brochure Collection...');
  console.log('================================================');
  
  const stores = ['Billa', 'Fantastico'];
  const results = [];
  
  try {
    for (const store of stores) {
      try {
        console.log(`\n📋 Processing ${store}...`);
        
        if (store === 'Billa') {
          await collectBillaBrochureDataInternal();
        } else if (store === 'Fantastico') {
          await collectFantasticoBrochureDataInternal();
        }
        
        results.push({ store, success: true });
        
      } catch (error) {
        console.error(`❌ Error collecting ${store} data:`, error.message);
        results.push({ store, success: false, error: error.message });
      }
    }
    
    // Summary
    console.log('\n📊 Collection Summary:');
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${status} ${result.store}: ${result.success ? 'Success' : result.error}`);
    });
    
  } finally {
    // Close database connection once for all stores
    await closeDB();
  }
  
  return results;
}

/**
 * Internal Billa collection function without database closure
 */
async function collectBillaBrochureDataInternal() {
  console.log('🛒 Starting Billa Brochure Collection...');
  console.log('================================================');
  
  // Check if already processed today
  const alreadyProcessed = await wasProcessedToday('Billa');
  if (alreadyProcessed) {
    console.log('ℹ️  Billa brochure already processed today. Skipping...');
    return;
  }

  // Find latest brochure URL
  const brochureUrl = await findLatestBillaBrochureUrl();
  
  // Process brochure and extract products
  const products = await processBillaBrochure(brochureUrl);
  
  if (products.length === 0) {
    console.log('⚠️  No products found in brochure');
    return;
  }

  // Save to database
  await saveProductsToDatabase(products);
  
  console.log('✅ Billa brochure collection completed successfully!');
}

/**
 * Internal Fantastico collection function without database closure
 */
async function collectFantasticoBrochureDataInternal() {
  console.log('🛒 Starting Fantastico Brochure Collection...');
  console.log('================================================');
  
  // Check if already processed today
  const alreadyProcessed = await wasProcessedToday('Fantastico');
  if (alreadyProcessed) {
    console.log('ℹ️  Fantastico brochure already processed today. Skipping...');
    return;
  }

  // Find latest brochure URL
  const brochureUrl = await findLatestFantasticoBrochureUrl();
  
  // Process brochure and extract products
  const products = await processFantasticoBrochure(brochureUrl);
  
  if (products.length === 0) {
    console.log('⚠️  No products found in brochure');
    return;
  }

  // Save to database
  await saveProductsToDatabase(products);
  
  console.log('✅ Fantastico brochure collection completed successfully!');
}

/**
 * Main collection function
 */
async function collectBillaBrochureData() {
  console.log('🛒 Starting Billa Brochure Collection...');
  console.log('================================================');
  
  try {
    // Check if already processed today
    const alreadyProcessed = await wasProcessedToday('Billa');
    if (alreadyProcessed) {
      console.log('ℹ️  Billa brochure already processed today. Skipping...');
      return;
    }

    // Find latest brochure URL
    const brochureUrl = await findLatestBillaBrochureUrl();
    
    // Process brochure and extract products
    const products = await processBillaBrochure(brochureUrl);
    
    if (products.length === 0) {
      console.log('⚠️  No products found in brochure');
      return;
    }

    // Save to database
    await saveProductsToDatabase(products);
    
    console.log('✅ Billa brochure collection completed successfully!');
    
  } catch (error) {
    console.error('❌ Error in Billa brochure collection:', error);
    throw error;
  } finally {
    await closeDB();
  }
}

/**
 * Enhanced brochure discovery with alternative methods
 */
async function findBrochureWithAlternatives() {
  const alternatives = [
    // Primary method
    () => findLatestBillaBrochureUrl(),
    
    // Alternative: Check social media or news feeds
    async () => {
      // This could check Billa's Facebook, Instagram, or RSS feeds
      // for recent brochure posts
      throw new Error('Social media fallback not implemented');
    },
    
    // Alternative: Use a known URL pattern with current date
    async () => {
      const currentDate = new Date();
      const weekNumber = getWeekNumber(currentDate);
      const year = currentDate.getFullYear();
      
      // This is a hypothetical URL pattern - would need to be updated
      // based on actual Billa URL structure
      const estimatedUrl = `https://view.publitas.com/billa/weekly-${year}-${weekNumber}.pdf`;
      
      // Test if URL exists
      const response = await axios.head(estimatedUrl);
      if (response.status === 200) {
        return estimatedUrl;
      }
      throw new Error('Estimated URL not found');
    }
  ];

  for (const [index, method] of alternatives.entries()) {
    try {
      console.log(`Trying brochure discovery method ${index + 1}...`);
      const url = await method();
      console.log(`✅ Found brochure URL: ${url}`);
      return url;
    } catch (error) {
      console.log(`❌ Method ${index + 1} failed: ${error.message}`);
      if (index === alternatives.length - 1) {
        throw new Error('All brochure discovery methods failed');
      }
    }
  }
}

/**
 * Get week number of the year
 * @param {Date} date 
 * @returns {number} Week number
 */
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Run if called directly
if (require.main === module) {
  // Check command line arguments for specific store
  const args = process.argv.slice(2);
  const store = args[0]?.toLowerCase();
  
  let collectionFunction;
  
  if (store === 'billa') {
    collectionFunction = collectBillaBrochureData;
  } else if (store === 'fantastico') {
    collectionFunction = collectFantasticoBrochureData;
  } else {
    // Default: collect from all stores
    collectionFunction = collectAllBrochureData;
  }
  
  collectionFunction()
    .then(() => {
      console.log('Collection completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Collection failed:', error);
      process.exit(1);
    });
}

module.exports = {
  collectBillaBrochureData,
  collectFantasticoBrochureData,
  collectAllBrochureData,
  findLatestBillaBrochureUrl,
  findLatestFantasticoBrochureUrl,
  processBillaBrochure,
  processFantasticoBrochure,
  saveProductsToDatabase
};