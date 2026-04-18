require('dotenv').config();
const connectDB = require('./config/database');
const { startShipkloudPushOrderCron } = require('./utils/shipkloudPushOrderCron');
const { startShipkloudTrackingCron } = require('./utils/shipkloudTrackingCron');
const { startDailyEmailReportsCron } = require('./utils/dailyEmailReportsCron');

/**
 * Isolated Shipkloud Cron Server
 */
const startServer = async () => {
    console.log('--- Isolated Shipkloud Cron Service ---');

    // 1. Connect to Database
    await connectDB();

    // 2. Start the Cron Jobs
    startShipkloudPushOrderCron();
    startShipkloudTrackingCron();
    startDailyEmailReportsCron();

    console.log('Process is idle and waiting for the next cron execution...');
};

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down Cron Service...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down Cron Service...');
    process.exit(0);
});

// Start
startServer();
