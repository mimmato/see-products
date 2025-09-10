#!/usr/bin/env node

const { query, closeDB } = require('./utils/database');

async function cleanBillaData() {
    console.log('🧹 Starting Billa data cleanup...');
    
    try {
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
        
    } catch (error) {
        console.error('❌ Error during Billa data cleanup:', error.message);
        throw error;
    } finally {
        await closeDB();
    }
}

// Run the cleanup if called directly
if (require.main === module) {
    cleanBillaData()
        .then(() => {
            console.log('✅ Cleanup script finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Cleanup script failed:', error.message);
            process.exit(1);
        });
}

module.exports = { cleanBillaData };