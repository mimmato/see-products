#!/usr/bin/env node

const { query, closeDB } = require('./utils/database');

async function cleanFantasticoData() {
    console.log('🧹 Starting Fantastico data cleanup...');
    
    try {
        // First, get count of existing Fantastico records
        const countResult = await query(
            'SELECT COUNT(*) as count FROM price_data WHERE store_name = $1',
            ['Fantastico']
        );
        
        const existingCount = parseInt(countResult.rows[0].count);
        console.log(`📊 Found ${existingCount} existing Fantastico records`);
        
        if (existingCount === 0) {
            console.log('✅ No Fantastico data to clean - database is already clean');
            return;
        }
        
        // Delete all Fantastico records
        console.log('🗑️  Removing existing Fantastico data...');
        const deleteResult = await query(
            'DELETE FROM price_data WHERE store_name = $1',
            ['Fantastico']
        );
        
        console.log(`✅ Successfully removed ${deleteResult.rowCount} Fantastico records`);
        
        // Refresh materialized view
        console.log('🔄 Refreshing materialized view...');
        await query('REFRESH MATERIALIZED VIEW daily_average_prices');
        console.log('✅ Materialized view refreshed successfully');
        
        console.log('🎉 Fantastico data cleanup completed successfully!');
        
    } catch (error) {
        console.error('❌ Error during Fantastico data cleanup:', error.message);
        throw error;
    } finally {
        await closeDB();
    }
}

// Run the cleanup if called directly
if (require.main === module) {
    cleanFantasticoData()
        .then(() => {
            console.log('✅ Cleanup script finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Cleanup script failed:', error.message);
            process.exit(1);
        });
}

module.exports = { cleanFantasticoData };