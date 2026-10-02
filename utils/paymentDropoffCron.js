const cron = require("node-cron");
const axios = require("axios");
const Cart = require("../models/Cart");
const NotificationLog = require("../models/NotificationLog");
const config = require("../config/config");

const processPaymentDropoffCarts = async () => {
  console.log("Running Payment Dropoff Notification Cron Job...");

  try {
    const dropoffMinutes = config.PAYMENT_DROPOFF_MINUTES || 30;
    const dropoffThreshold = new Date(Date.now() - dropoffMinutes * 60 * 1000);

    const eligibleCarts = await Cart.find({
      status: { $in: ["active"] },
      razorpayOrderId: { $ne: null, $exists: true },
      paymentStatus: { $ne: "paid" },
      paymentDropoffNotificationSent: { $ne: true },
      updatedAt: { $lte: dropoffThreshold },
      otpMethod: "whatsapp",
      "items.0": { $exists: true },
    });

    if (eligibleCarts.length === 0) {
      console.log("No eligible payment dropoff carts found.");
      return;
    }

    console.log(`Found ${eligibleCarts.length} payment dropoff cart(s) to notify.`);

    for (const cart of eligibleCarts) {
      try {
        const phoneNumber = cart.phoneNumber;
        if (!phoneNumber) continue;

        const customerName = cart.shippingAddress?.fullName?.trim() ? cart.shippingAddress.fullName.trim().split(" ")[0] : "there";
        const itemCount = cart.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        const symbol = cart.currencySymbol || "₹";
        const formattedAmount = `${symbol}${Math.round(cart.totalAmount).toLocaleString("en-IN")}`;
        const fallbackMessageText = `Hi ${customerName}, so close! 🎯 Your order with ${itemCount} item(s) is all set, but the payment didn't go through. 💳 Amount: ${formattedAmount}. Please try the payment again to complete your order.`;

        try {
          let countryCode = "91";
          let phoneStr = phoneNumber.toString().replace(/[^0-9]/g, "");
          if (phoneStr.length > 10) {
            countryCode = phoneStr.substring(0, phoneStr.length - 10);
            phoneStr = phoneStr.substring(phoneStr.length - 10);
          }

          const interaktPayload = {
            countryCode: countryCode,
            phoneNumber: phoneStr,
            type: "Template",
            template: {
              name: config.INTERAKT_PAYMENT_DROPOFF_TEMPLATE_NAME,
              languageCode: "en",
              bodyValues: [
                customerName,
                itemCount.toString(),
                formattedAmount.toString(),
              ],
            },
          };

          const response = await axios.post(
            config.INTERAKT_URL,
            interaktPayload,
            {
              headers: {
                Authorization: `Basic ${config.INTERAKT_API_KEY}`,
                "Content-Type": "application/json",
              },
            },
          );

          if (response.data && response.data.result !== false) {
            console.log(
              `Payment dropoff WhatsApp sent to ${phoneNumber} for cart ${cart._id}. Interakt ID: ${response.data.id || "N/A"}`,
            );

            // Log to NotificationLog for async failure webhook fallback
            if (response.data.id) {
              try {
                await NotificationLog.create({
                  interaktMessageId: response.data.id,
                  recipientPhone: phoneNumber,
                  templateName: config.INTERAKT_PAYMENT_DROPOFF_TEMPLATE_NAME,
                  fallbackText: fallbackMessageText,
                  sendSmsFallback: false,
                  metadata: {
                    type: "payment_dropoff",
                    cartId: cart._id,
                    razorpayOrderId: cart.razorpayOrderId,
                  },
                });
              } catch (logErr) {
                console.log(
                  "Error creating NotificationLog for payment dropoff:",
                  logErr.message,
                );
              }
            }
          }
        } catch (waError) {
          console.log(
            `Error sending WhatsApp payment dropoff via Interakt to ${phoneNumber}:`,
            waError.response ? waError.response.data : waError.message,
          );
        }

        // Mark notification sent on cart
        cart.paymentDropoffNotificationSent = true;
        cart.paymentDropoffNotificationSentAt = new Date();
        await cart.save();
      } catch (cartError) {
        console.log(`Error processing payment dropoff notification for cart ${cart._id}:`, cartError.message);
      }
    }
  } catch (error) {
    console.log("Error in Payment Dropoff Notification Cron Job:", error);
  }
};

const startPaymentDropoffCron = () => {
  const cronSchedule = config.PAYMENT_DROPOFF_CRON || "*/5 * * * *";
  cron.schedule(cronSchedule, processPaymentDropoffCarts);
  console.log(
    `Payment Dropoff Notification Cron Job scheduled with expression '${cronSchedule}'.`,
  );
};

module.exports = { startPaymentDropoffCron, processPaymentDropoffCarts };
