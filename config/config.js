require('dotenv').config();

module.exports = {
    // Server Configuration
    PORT: process.env.PORT || 3000,

    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zana-motors',

    // SHIPKLOUD Configuration
    SHIPKLOUD_PUBLIC_KEY: process.env.SHIPKLOUD_PUBLIC_KEY,
    SHIPKLOUD_PRIVATE_KEY: process.env.SHIPKLOUD_PRIVATE_KEY,
    SHIPKLOUD_PUSH_ORDER_URL: process.env.SHIPKLOUD_PUSH_ORDER_URL,
    SHIPKLOUD_GET_ORDER_DETAILS_URL: process.env.SHIPKLOUD_GET_ORDER_DETAILS_URL
};
