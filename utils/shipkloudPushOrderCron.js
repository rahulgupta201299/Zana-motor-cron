const cron = require('node-cron');
const axios = require('axios');
const Order = require('../models/Order');
const config = require('../config/config')
const BikeProduct = require('../models/BikeProduct')
const { SHIPKLOUD_PUBLIC_KEY, SHIPKLOUD_PRIVATE_KEY, SHIPKLOUD_PUSH_ORDER_URL, SHIPKLOUD_GET_ORDER_DETAILS_URL } = config;

const pushOrdersToShipkloud = async () => {
    console.log('Running Shipkloud Order Push Cron Job...');

    try {
        const orders = await Order.find({
            $and: [
                {
                    $or: [
                        { paymentMethod: 'cod', paymentStatus: 'pending', orderStatus: 'pending', advancePaid: 0 },
                        { paymentMethod: 'cod', paymentStatus: 'partial_paid', orderStatus: 'placed' },
                        { paymentMethod: 'online', paymentStatus: 'paid', orderStatus: 'placed' }
                    ]
                },
                { logisticsTrackingNumber: null },
                { logisticsOrderId: null }
            ]
        }).populate('items.product');

        if (orders.length === 0) {
            console.log('No orders found matching the criteria.');
            return;
        }

        console.log(`Found ${orders.length} orders to push.`);

        for (const order of orders) {
            try {
                const payload = {
                    order_id: order.orderNumber,
                    order_date: order.orderDate.toISOString().split('T')[0],
                    order_type: 'ESSENTIALS',
                    consignee_name: order.shippingAddress.fullName,
                    consignee_phone: parseInt(order.shippingAddress.phone.replace(/\D/g, '').slice(-10)),
                    consignee_alternate_phone: "",
                    consignee_email: order.emailId || '',
                    consignee_address_line_one: order.shippingAddress.addressLine1,
                    consignee_address_line_two: order.shippingAddress.addressLine2 || '',
                    consignee_pin_code: parseInt(order.shippingAddress.postalCode),
                    consignee_city: order.shippingAddress.city,
                    consignee_state: order.shippingAddress.state,
                    product_detail: order.items.map(item => ({
                        name: item.product ? item.product.name : 'Unknown Product',
                        sku_number: item.product ? item.product.productCode || 'N/A' : 'N/A',
                        quantity: item.quantity,
                        discount: "",
                        hsn: "",
                        unit_price: item.price,
                        product_category: item.product ? item.product.category || 'Other' : 'Other'
                    })),
                    payment_type: order.paymentMethod === 'cod' ? 'COD' : 'PREPAID',
                    cod_amount: order.paymentMethod === 'cod' ? (order.totalAmount - (order.advancePaid || 0)) : "",
                    shipping_charges: order.shippingCost || 0,
                    weight: 1,
                    length: 1,
                    width: 1,
                    height: 1,
                    warehouse_id: "",
                    gst_ewaybill_number: "",
                    gstin_number: ""
                };

                const response = await axios.post(SHIPKLOUD_PUSH_ORDER_URL, payload, {
                    headers: {
                        'public-key': SHIPKLOUD_PUBLIC_KEY,
                        'private-key': SHIPKLOUD_PRIVATE_KEY,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data && response.data.data && response.data.data.refrence_id) {
                    order.logisticsOrderId = response.data.data.order_id;
                    order.logisticsReferenceId = response.data.data.refrence_id;
                    await order.save();
                    console.log(`Successfully pushed order ${order.orderNumber}. Logistics Order ID: ${response.data.data.refrence_id}`);
                } else {
                    console.error(`Failed to get refrence_id for order ${order.orderNumber}:`, response.data);
                }
            } catch (error) {
                console.log(error)
                console.log(`Error pushing order ${order.orderNumber}:`, error.response ? error.response.data : error.message);
            }
        }
    } catch (error) {
        console.log('Error in Shipkloud Cron Job:', error);
    }
};

const startShipkloudPushOrderCron = () => {
    const { PUSH_ORDER_CRON = '*/5 * * * *' } = config
    cron.schedule(PUSH_ORDER_CRON, pushOrdersToShipkloud);
    console.log('Shipkloud Order Push Cron Job scheduled for every 5 minutes.');
};

module.exports = { startShipkloudPushOrderCron, pushOrdersToShipkloud };
