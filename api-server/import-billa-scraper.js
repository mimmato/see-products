#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { query, closeDB } = require('./utils/database');

class BillaScraperImporter {
    constructor() {
        this.projectRoot = path.dirname(__dirname);
        this.scraperPath = path.join(this.projectRoot, 'billa_scraper.py');
        this.outputDir = path.join(this.projectRoot, 'output');
    }

    async runPythonScraper() {
        console.log('🐍 Running Billa scraper...');
        
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python3', [this.scraperPath], {
                cwd: this.projectRoot,
                stdio: ['inherit', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('📄', output.trim());
                stdout += output;
            });

            pythonProcess.stderr.on('data', (data) => {
                const output = data.toString();
                console.error('⚠️', output.trim());
                stderr += output;
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Python scraper completed successfully');
                    resolve({ stdout, stderr });
                } else {
                    console.error('❌ Python scraper failed with code:', code);
                    reject(new Error(`Scraper failed with exit code ${code}: ${stderr}`));
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('❌ Failed to start Python scraper:', error.message);
                reject(error);
            });
        });
    }

    async findLatestOutputFile() {
        console.log('🔍 Looking for scraper output files...');
        
        try {
            const files = await fs.readdir(this.outputDir);
            const billaFiles = files
                .filter(file => file.startsWith('billa_brochure_') && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    path: path.join(this.outputDir, file),
                    // Extract timestamp from filename: billa_brochure_20231210_143022.json
                    timestamp: file.match(/billa_brochure_(\d{8}_\d{6})\.json$/)?.[1]
                }))
                .filter(file => file.timestamp)
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

            if (billaFiles.length === 0) {
                throw new Error('No Billa scraper output files found in output directory');
            }

            const latestFile = billaFiles[0];
            console.log(`📁 Found latest output file: ${latestFile.name}`);
            return latestFile.path;

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Output directory does not exist. Make sure the scraper ran successfully.');
            }
            throw error;
        }
    }

    async loadScrapedData(filePath) {
        console.log('📖 Loading scraped data...');
        
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(fileContent);
            
            if (!Array.isArray(data)) {
                throw new Error('Invalid data format - expected array of products');
            }
            
            console.log(`📊 Loaded ${data.length} products from scraper output`);
            return data;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Scraper output file not found: ${filePath}`);
            } else if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON in scraper output: ${error.message}`);
            }
            throw error;
        }
    }

    mapProductToDatabase(product) {
        // Map scraper output to database schema
        const currentPrice = product.new_price || product.old_price;
        const previousPrice = product.new_price ? product.old_price : null;
        
        if (!currentPrice || currentPrice <= 0) {
            return null; // Skip products without valid prices
        }

        return {
            store_name: 'Billa',
            product_name: product.name?.trim(),
            price: parseFloat(currentPrice),
            old_price: previousPrice ? parseFloat(previousPrice) : null,
            discount_percentage: product.discount_percent ? parseFloat(product.discount_percent) : null,
            currency: 'BGN', // Convert лв. to standard BGN
            in_stock: true,
            extracted_at: product.extracted_at || new Date().toISOString()
        };
    }

    async insertProducts(products) {
        console.log('💾 Inserting products into database...');
        
        const validProducts = products
            .map(product => this.mapProductToDatabase(product))
            .filter(product => product && product.product_name && product.product_name.length >= 3);

        if (validProducts.length === 0) {
            console.warn('⚠️ No valid products to insert');
            return 0;
        }

        console.log(`📝 Processing ${validProducts.length} valid products out of ${products.length} scraped`);

        const insertQuery = `
            INSERT INTO price_data (
                store_name, product_name, price, old_price, 
                discount_percentage, currency, in_stock, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `;

        let insertedCount = 0;
        let errorCount = 0;

        for (const product of validProducts) {
            try {
                await query(insertQuery, [
                    product.store_name,
                    product.product_name,
                    product.price,
                    product.old_price,
                    product.discount_percentage,
                    product.currency,
                    product.in_stock
                ]);
                insertedCount++;
                
                if (insertedCount % 50 === 0) {
                    console.log(`📊 Inserted ${insertedCount}/${validProducts.length} products...`);
                }
                
            } catch (error) {
                console.error(`❌ Failed to insert product "${product.product_name}":`, error.message);
                errorCount++;
            }
        }

        console.log(`✅ Successfully inserted ${insertedCount} products`);
        if (errorCount > 0) {
            console.warn(`⚠️ ${errorCount} products failed to insert`);
        }

        return insertedCount;
    }

    async refreshMaterializedView() {
        console.log('🔄 Refreshing materialized view...');
        try {
            await query('REFRESH MATERIALIZED VIEW daily_average_prices');
            console.log('✅ Materialized view refreshed successfully');
        } catch (error) {
            console.error('⚠️ Warning: Failed to refresh materialized view:', error.message);
        }
    }

    async importData() {
        try {
            // Step 1: Run the Python scraper
            await this.runPythonScraper();
            
            // Step 2: Find the latest output file
            const outputFile = await this.findLatestOutputFile();
            
            // Step 3: Load the scraped data
            const products = await this.loadScrapedData(outputFile);
            
            // Step 4: Insert products into database
            const insertedCount = await this.insertProducts(products);
            
            // Step 5: Refresh materialized view
            await this.refreshMaterializedView();
            
            console.log(`🎉 Import completed! ${insertedCount} Billa products imported successfully.`);
            return insertedCount;
            
        } catch (error) {
            console.error('❌ Import failed:', error.message);
            throw error;
        }
    }
}

// Main execution function
async function main() {
    const importer = new BillaScraperImporter();
    
    try {
        console.log('🚀 Starting Billa scraper import process...');
        const count = await importer.importData();
        console.log(`✅ Import process completed successfully! Imported ${count} products.`);
        return count;
        
    } catch (error) {
        console.error('❌ Import process failed:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    main()
        .then((count) => {
            console.log(`✅ Import completed: ${count} products`);
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Import failed:', error.message);
            process.exit(1);
        })
        .finally(async () => {
            await closeDB();
        });
}

module.exports = { BillaScraperImporter };