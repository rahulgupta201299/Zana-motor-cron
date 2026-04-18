const cron = require('node-cron');
const axios = require('axios');
const Order = require('../models/Order');
const config = require('../config/config');
const { SHIPKLOUD_PUBLIC_KEY, SHIPKLOUD_PRIVATE_KEY, SHIPKLOUD_GET_ORDER_DETAILS_URL } = config;

/**
 * Cron task to check and update shipment tracking details from Shipkloud.
 */
const updateShipkloudShipmentDetails = async () => {
    console.log('Running Shipkloud Tracking Cron Job...');

    try {
        // Query orders that have a logisticsOrderId but don't have an AWB number yet
        const orders = await Order.find({
            logisticsOrderId: { $exists: true, $ne: null },
            logisticsAWBNumber: null
        });

        if (orders.length === 0) {
            console.log('No orders pending tracking update.');
            return;
        }

        console.log(`Checking tracking for ${orders.length} orders.`);

        for (const order of orders) {
            try {
                // API call to Shipkloud to get order details
                // Assuming POST with order_id as per integration pattern
                const response = await axios.get(`${SHIPKLOUD_GET_ORDER_DETAILS_URL}/${order.logisticsOrderId}`,
                    {
                        headers: {
                            'public-key': SHIPKLOUD_PUBLIC_KEY,
                            'private-key': SHIPKLOUD_PRIVATE_KEY,
                            'Content-Type': 'application/json'
                        }
                    });

                // Validate successful response
                if (response.data && response.data.result == "1" && response.data.data && response.data.data.length > 0) {
                    const shipmentData = response.data.data[0];
                    const awbNumber = shipmentData.shipping_details ? shipmentData.shipping_details.awb_number : null;

                    if (awbNumber) {
                        order.logisticsAWBNumber = awbNumber;
                        await order.save();
                        console.log(`Successfully updated AWB for order ${order.orderNumber}: ${awbNumber}`);
                    } else {
                        console.log(`AWB number is not yet generated for order ${order.orderNumber} (Status: ${shipmentData.order_status}).`);
                    }
                } else {
                    console.error(`Status check failed for order ${order.orderNumber}:`, response.data.message || 'Unknown response format');
                }
            } catch (error) {
                console.log(error)
                console.error(`Error fetching tracking for order ${order.orderNumber}:`, error.response ? error.response.data : error.message);
            }
        }
    } catch (error) {
        console.error('Error in Shipkloud Tracking Cron Job:', error);
    }
};

/**
 * Initializes and schedules the tracking cron job.
 */
const startShipkloudTrackingCron = () => {
    // Run every 5 minutes: */5 * * * *
    const { TRACK_ORDER_CRON = '*/5 * * * *' } = config
    cron.schedule(TRACK_ORDER_CRON, updateShipkloudShipmentDetails);
    console.log('Shipkloud Tracking Cron Job scheduled for every 5 minutes.');
};

module.exports = { startShipkloudTrackingCron, updateShipkloudShipmentDetails };
