const cron = require('node-cron');
const axios = require('axios');
const Cart = require('../models/Cart');
const NotificationLog = require('../models/NotificationLog');
const config = require('../config/config');

const processAbandonedCarts = async () => {
    console.log('Running Abandoned Cart Notification Cron Job...');

    try {
        const abandonedCartMinutes = config.ABANDONED_CART_MINUTES || 30;
        const abandonedCartThreshold = new Date(Date.now() - abandonedCartMinutes * 60 * 1000);

        // Find eligible carts where:
        // - Cart status is active
        // - razorpayOrderId is NOT generated (payment was NOT initiated)
        // - paymentStatus is not 'paid'
        // - abandonedCartNotificationSent is not true
        // - updatedAt <= 30 minutes ago (configurable)
        // - otpMethod is 'whatsapp'
        // - Has items in cart
        const eligibleCarts = await Cart.find({
            status: { $in: ['active'] },
            $or: [
                { razorpayOrderId: null },
                { razorpayOrderId: { $exists: false } },
                { razorpayOrderId: '' }
            ],
            paymentStatus: { $ne: 'paid' },
            abandonedCartNotificationSent: { $ne: true },
            updatedAt: { $lte: abandonedCartThreshold },
            otpMethod: 'whatsapp',
            'items.0': { $exists: true }
        });

        if (eligibleCarts.length === 0) {
            console.log('No eligible abandoned carts found.');
            return;
        }

        console.log(`Found ${eligibleCarts.length} abandoned cart(s) to notify.`);

        for (const cart of eligibleCarts) {
            try {
                const phoneNumber = cart.phoneNumber;
                if (!phoneNumber) continue;

                // Template placeholders:
                // {{1}} = Customer Name (first name from shipping address or 'there')
                const customerName = cart.shippingAddress?.fullName?.trim()
                    ? cart.shippingAddress.fullName.trim().split(' ')[0]
                    : 'there';

                // {{2}} = Total item count in cart
                const itemCount = cart.items.reduce((sum, item) => sum + (item.quantity || 1), 0);

                // {{3}} = Amount formatted
                const symbol = cart.currencySymbol || '₹';
                const formattedAmount = `${symbol}${Math.round(cart.totalAmount).toLocaleString('en-IN')}`;

                // Fallback text for Twilio SMS / NotificationLog
                const fallbackMessageText = `Hi ${customerName}, you left something behind! 🛒 Your cart with ${itemCount} items is still waiting for you. Items are selling fast, so grab them before they're gone. 🛍️ Cart total: ${formattedAmount}. Tap below to complete your order.`;

                // Send WhatsApp via Interakt
                if (config.INTERAKT_API_KEY) {
                    try {
                        let countryCode = '91';
                        let phoneStr = phoneNumber.toString().replace(/[^0-9]/g, '');
                        if (phoneStr.length > 10) {
                            countryCode = phoneStr.substring(0, phoneStr.length - 10);
                            phoneStr = phoneStr.substring(phoneStr.length - 10);
                        }

                        const interaktPayload = {
                            countryCode: countryCode,
                            phoneNumber: phoneStr,
                            type: 'Template',
                            template: {
                                name: config.INTERAKT_ABANDONED_CART_TEMPLATE_NAME,
                                languageCode: 'en',
                                bodyValues: [
                                    customerName,
                                    itemCount.toString(),
                                    formattedAmount.toString()
                                ]
                            }
                        };

                        const response = await axios.post(config.INTERAKT_URL, interaktPayload, {
                            headers: {
                                'Authorization': `Basic ${config.INTERAKT_API_KEY}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        if (response.data && response.data.result !== false) {
                            console.log(`Abandoned cart WhatsApp sent to ${phoneNumber} for cart ${cart._id}. Interakt ID: ${response.data.id || 'N/A'}`);

                            // Log to NotificationLog for async failure webhook fallback
                            if (response.data.id) {
                                try {
                                    const formattedRecipientPhone = (phoneNumber && phoneNumber.includes('-'))
                                        ? phoneNumber
                                        : `+${countryCode}-${phoneStr}`;

                                    await NotificationLog.create({
                                        interaktMessageId: response.data.id,
                                        recipientPhone: formattedRecipientPhone,
                                        templateName: config.INTERAKT_ABANDONED_CART_TEMPLATE_NAME,
                                        fallbackText: fallbackMessageText,
                                        sendSmsFallback: false,
                                        metadata: { type: 'abandoned_cart', cartId: cart._id }
                                    });
                                } catch (logErr) {
                                    console.log('Error creating NotificationLog for abandoned cart:', logErr.message);
                                }
                            }
                        }
                    } catch (waError) {
                        console.log(`Error sending WhatsApp abandoned cart notification via Interakt to ${phoneNumber}:`, waError.response ? waError.response.data : waError.message);
                    }
                }

                // Mark notification sent on cart
                cart.abandonedCartNotificationSent = true;
                cart.abandonedCartNotificationSentAt = new Date();
                await cart.save();

            } catch (cartError) {
                console.log(`Error processing abandoned cart notification for cart ${cart._id}:`, cartError.message);
            }
        }

    } catch (error) {
        console.log('Error in Abandoned Cart Notification Cron Job:', error);
    }
};

const startAbandonedCartCron = () => {
    const cronSchedule = config.ABANDONED_CART_CRON || '*/5 * * * *';
    cron.schedule(cronSchedule, processAbandonedCarts);
    console.log(`Abandoned Cart Notification Cron Job scheduled with expression '${cronSchedule}'.`);
};

module.exports = { startAbandonedCartCron, processAbandonedCarts };
