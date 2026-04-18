require('dotenv').config();

module.exports = {
    // Server Configuration
    PORT: process.env.PORT || 3000,

    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zana-motors',

    // Email / SMTP Configuration
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    EMAIL_TO: process.env.EMAIL_TO,

    // SHIPKLOUD Configuration
    SHIPKLOUD_PUBLIC_KEY: process.env.SHIPKLOUD_PUBLIC_KEY,
    SHIPKLOUD_PRIVATE_KEY: process.env.SHIPKLOUD_PRIVATE_KEY,
    SHIPKLOUD_PUSH_ORDER_URL: process.env.SHIPKLOUD_PUSH_ORDER_URL,
    SHIPKLOUD_GET_ORDER_DETAILS_URL: process.env.SHIPKLOUD_GET_ORDER_DETAILS_URL,

    DAILY_REPORTS_CRON: process.env.DAILY_REPORTS_CRON,
    PUSH_ORDER_CRON: process.env.PUSH_ORDER_CRON,
    TRACK_ORDER_CRON: process.env.TRACK_ORDER_CRON
};
