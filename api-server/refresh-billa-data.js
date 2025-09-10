#!/usr/bin/env node

const { query, closeDB } = require('./utils/database');
const { BillaScraperImporter } = require('./import-billa-scraper');

async function cleanBillaDataInternal() {
    console.log('🧹 Starting Billa data cleanup...');
    
    // First, get count of existing Billa records
    const countResult = await query(
        'SELECT COUNT(*) as count FROM price_data WHERE store_name = $1',
        ['Billa']
    );
    
    const existingCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Found ${existingCount} existing Billa records`);
    
    if (existingCount === 0) {
        console.log('✅ No Billa data to clean - database is already clean');
        return;
    }
    
    // Delete all Billa records
    console.log('🗑️  Removing existing Billa data...');
    const deleteResult = await query(
        'DELETE FROM price_data WHERE store_name = $1',
        ['Billa']
    );
    
    console.log(`✅ Successfully removed ${deleteResult.rowCount} Billa records`);
    
    // Refresh materialized view
    console.log('🔄 Refreshing materialized view...');
    await query('REFRESH MATERIALIZED VIEW daily_average_prices');
    console.log('✅ Materialized view refreshed successfully');
    
    console.log('🎉 Billa data cleanup completed successfully!');
}

async function refreshBillaData() {
    console.log('🔄 Starting complete Billa data refresh...');
    console.log('=' .repeat(60));
    
    try {
        // Step 1: Clean existing Billa data
        console.log('STEP 1: Cleaning existing Billa data');
        await cleanBillaDataInternal();
        
        console.log('\n' + '=' .repeat(60));
        
        // Step 2: Import fresh data from scraper
        console.log('STEP 2: Importing fresh Billa data');
        const importer = new BillaScraperImporter();
        const importedCount = await importer.importData();
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 COMPLETE! Billa data refresh finished successfully!');
        console.log(`📊 Total products imported: ${importedCount}`);
        console.log('💡 You can now check the results in your price tracker frontend.');
        
    } catch (error) {
        console.error('\n' + '=' .repeat(60));
        console.error('❌ FAILED! Billa data refresh encountered an error:');
        console.error(error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    refreshBillaData()
        .then(() => {
            console.log('\n✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error.message);
            process.exit(1);
        });
}

module.exports = { refreshBillaData };