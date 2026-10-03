const cron = require('node-cron');
const axios = require('axios');
const Cart = require('../models/Cart');
const NotificationLog = require('../models/NotificationLog');
const config = require('../config/config');

function getYesterdayRangeIST() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const [yearStr, monthStr, dayStr] = formatter.format(now).split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);

    // Today at 00:00:00.000 IST represented in UTC
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    const todayStartISTinUTC = Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS;

    const yesterdayStart = new Date(todayStartISTinUTC - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(todayStartISTinUTC);

    return { start: yesterdayStart, end: yesterdayEnd };
}

const processYesterdayAbandonedCarts = async () => {
    console.log('Running Yesterday Abandoned Cart Notification Cron Job...');

    try {
        const { start: yesterdayStart, end: yesterdayEnd } = getYesterdayRangeIST();
        console.log(`[Yesterday Abandoned Cart] Checking carts with updatedAt between ${yesterdayStart.toISOString()} and ${yesterdayEnd.toISOString()}`);

        const eligibleCarts = await Cart.find({
            status: { $in: ['active'] },
            paymentStatus: { $ne: 'paid' },
            abandonedCartYesterdayNotificationSent: { $ne: true },
            updatedAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
            otpMethod: 'whatsapp',
            'items.0': { $exists: true }
        });

        if (eligibleCarts.length === 0) {
            console.log('No eligible yesterday abandoned carts found.');
            return;
        }

        console.log(`Found ${eligibleCarts.length} yesterday abandoned cart(s) to notify.`);

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
                            console.log(`Yesterday abandoned cart WhatsApp sent to ${phoneNumber} for cart ${cart._id}. Interakt ID: ${response.data.id || 'N/A'}`);

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
                                        metadata: { type: 'yesterday_abandoned_cart', cartId: cart._id }
                                    });
                                } catch (logErr) {
                                    console.log('Error creating NotificationLog for yesterday abandoned cart:', logErr.message);
                                }
                            }
                        }
                    } catch (waError) {
                        console.log(`Error sending WhatsApp yesterday abandoned cart notification via Interakt to ${phoneNumber}:`, waError.response ? waError.response.data : waError.message);
                    }
                }

                // Mark notification sent on cart using updateOne so updatedAt is not bumped
                await Cart.updateOne(
                    { _id: cart._id },
                    {
                        $set: {
                            abandonedCartYesterdayNotificationSent: true,
                            abandonedCartYesterdayNotificationSentAt: new Date()
                        }
                    }
                );

            } catch (cartError) {
                console.log(`Error processing yesterday abandoned cart notification for cart ${cart._id}:`, cartError.message);
            }
        }

    } catch (error) {
        console.log('Error in Yesterday Abandoned Cart Notification Cron Job:', error);
    }
};

const startYesterdayAbandonedCartCron = () => {
    const cronSchedule = config.YESTERDAY_ABANDONED_CART_CRON || '0 12 * * *';
    cron.schedule(
        cronSchedule,
        processYesterdayAbandonedCarts,
        { timezone: 'Asia/Kolkata' }
    );
    console.log(`Yesterday Abandoned Cart Notification Cron Job scheduled with expression '${cronSchedule}' (Asia/Kolkata).`);
};

module.exports = { startYesterdayAbandonedCartCron, processYesterdayAbandonedCarts, getYesterdayRangeIST };
