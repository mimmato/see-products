/**
 * Product parsing utilities for price data extraction
 */

/**
 * Parse price from various text formats
 * @param {string} priceText - Raw price text from scraper
 * @returns {number|null} - Parsed price or null if invalid
 */
function parsePrice(priceText) {
  if (!priceText) return null;
  
  // Remove whitespace and normalize
  const cleanText = priceText.trim().toLowerCase();
  
  // Extract numbers and decimal points
  const matches = cleanText.match(/[\d,.]+(лв|bgn)?/i);
  if (!matches) return null;
  
  // Clean the matched price
  const priceStr = matches[0].replace(/[^\d,.]/, '');
  
  // Handle different decimal separators
  let price = priceStr.replace(',', '.');
  price = parseFloat(price);
  
  // Validate price range (0.01 to 999.99 BGN)
  if (isNaN(price) || price <= 0 || price > 999.99) return null;
  
  return price;
}

/**
 * Normalize product name and extract useful information
 * @param {string} productName - Raw product name
 * @returns {object} - Normalized product information
 */
function normalizeProductName(productName) {
  if (!productName) return { name: '', brand: '', weight: '', unit: '' };
  
  const cleanName = productName.trim();
  
  // Extract weight/quantity information (e.g., "650г", "1л", "250мл")
  const weightMatch = cleanName.match(/(\d+\.?\d*)\s*(г|кг|мл|л|бр\.?)/i);
  const weight = weightMatch ? weightMatch[0] : '';
  const unit = weightMatch ? weightMatch[2] : '';
  
  // Try to extract brand (usually first word or first few words)
  const words = cleanName.split(' ');
  const brand = words.length > 1 ? words[0] : '';
  
  // Remove weight from name for cleaner product name
  const normalizedName = cleanName.replace(/\s*\d+\.?\d*\s*(г|кг|мл|л|бр\.?)/i, '').trim();
  
  return {
    name: normalizedName || cleanName,
    brand,
    weight,
    unit,
    originalName: cleanName
  };
}

/**
 * Normalize product data from various API formats
 * @param {object} product - Raw product data
 * @param {object} fieldMappings - Field name mappings
 * @returns {object|null} - Normalized product or null if invalid
 */
function normalizeProduct(product, fieldMappings = {}) {
  if (!product || typeof product !== 'object') return null;
  
  // Helper function to get field value from multiple possible field names
  const getFieldValue = (fieldArray) => {
    if (!Array.isArray(fieldArray)) fieldArray = [fieldArray];
    for (const fieldName of fieldArray) {
      if (fieldName && product[fieldName] != null) {
        return product[fieldName];
      }
    }
    return null;
  };
  
  // Extract values using field mappings
  const storeName = getFieldValue(fieldMappings.storeField || ['storeName', 'store', 'store_name']);
  const productName = getFieldValue(fieldMappings.nameField || ['name', 'productName', 'title']);
  const category = getFieldValue(fieldMappings.categoryField || ['category', 'productCategory']);
  const price = getFieldValue(fieldMappings.priceField || ['price', 'currentPrice', 'finalPrice']);
  const oldPrice = getFieldValue(fieldMappings.oldPriceField || ['oldPrice', 'previousPrice', 'originalPrice']);
  const url = getFieldValue(fieldMappings.urlField || ['url', 'productUrl', 'link']);
  const image = getFieldValue(fieldMappings.imageField || ['image', 'imageUrl', 'picUrl', 'img']);
  
  // Validate required fields
  if (!storeName || !productName || !price) {
    return null;
  }
  
  // Parse price
  const parsedPrice = typeof price === 'number' ? price : parsePrice(price);
  if (!parsedPrice || parsedPrice <= 0) {
    return null;
  }
  
  // Parse old price if available
  let parsedOldPrice = null;
  if (oldPrice) {
    parsedOldPrice = typeof oldPrice === 'number' ? oldPrice : parsePrice(oldPrice);
  }
  
  // Extract additional product information
  const productInfo = normalizeProductName(productName);
  
  return {
    store_name: storeName,
    product_name: productInfo.name,
    product_brand: productInfo.brand,
    product_weight: productInfo.weight,
    product_unit: productInfo.unit,
    product_category: category || categorizeProduct(productName),
    price: parsedPrice,
    old_price: parsedOldPrice,
    currency: 'BGN',
    product_url: url,
    image_url: image,
    in_stock: true
  };
}

/**
 * Extract discount percentage from text
 * @param {string} discountText - Text containing discount info
 * @returns {number|null} - Discount percentage or null
 */
function parseDiscount(discountText) {
  if (!discountText) return null;
  
  const match = discountText.match(/(\d+)%/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Categorize product based on name/keywords
 * @param {string} productName - Product name
 * @returns {string} - Category name
 */
function categorizeProduct(productName) {
  if (!productName) return 'Други';
  
  const name = productName.toLowerCase();
  
  // Define category keywords
  const categories = {
    'Хляб': ['хляб', 'питка', 'рогалки', 'кифла'],
    'Млечни': ['мляко', 'кисело мляко', 'кашкавал', 'сирене', 'масло', 'краве сирене'],
    'Месо': ['месо', 'свинско', 'телешко', 'пилешко', 'кебап', 'наденица', 'салам'],
    'Плодове и зеленчуци': ['домати', 'краставици', 'ябълки', 'банани', 'портокали', 'лимони'],
    'Напитки': ['вода', 'кока кола', 'фанта', 'спрайт', 'бира', 'вино', 'сок'],
    'Консерви': ['консерва', 'туна', 'фасул', 'домати консерва'],
    'Сладкиши': ['шоколад', 'бисквити', 'торта', 'сладки'],
    'Зърнени': ['ориз', 'макарони', 'спагети', 'брашно']
  };
  
  // Check each category for matching keywords
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return category;
    }
  }
  
  return 'Други';
}

module.exports = {
  parsePrice,
  normalizeProduct,
  normalizeProductName,
  parseDiscount,
  categorizeProduct
};