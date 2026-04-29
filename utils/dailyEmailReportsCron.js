const cron = require('node-cron');
const nodemailer = require('nodemailer');

const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Profile = require('../models/Profile');
const config = require('../config/config');

function getDayRange(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
}

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    const needsQuotes = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(rows, columns) {
    const header = columns.map(c => csvEscape(c.header)).join(',');
    const lines = rows.map(r => columns.map(c => csvEscape(c.get(r))).join(','));
    return [header, ...lines].join('\n');
}

function formatDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString();
}

function safePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/[^\d+]/g, '');
}

function getOrderPhone(order) {
    return safePhone(order && (order.phoneNumber || (order.shippingAddress && order.shippingAddress.phone)));
}

async function getProfilesByPhone(phoneNumbers) {
    const unique = Array.from(new Set(phoneNumbers.filter(Boolean)));
    if (unique.length === 0) return new Map();
    const profiles = await Profile.find({ phoneNumber: { $in: unique } }).lean();
    const m = new Map();
    for (const p of profiles) m.set(p.phoneNumber, p);
    return m;
}

function makeMailer() {
    const {
        SMTP_HOST,
        SMTP_PORT,
        SMTP_SECURE,
        SMTP_USER,
        SMTP_PASS,
        EMAIL_FROM,
        EMAIL_FROM_NAME,
        EMAIL_TO
    } = config;

    const toList = String(EMAIL_TO || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const missing = [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_SECURE',
        'SMTP_USER',
        'SMTP_PASS',
        'EMAIL_FROM',
        'EMAIL_FROM_NAME',
        'EMAIL_TO'
    ].filter(k => !config[k]);

    if (missing.length) {
        throw new Error(`Missing required env vars for email reports: ${missing.join(', ')}`);
    }

    if (toList.length === 0) {
        throw new Error('EMAIL_TO is empty after parsing comma-separated list.');
    }

    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: String(SMTP_SECURE).toLowerCase() === 'true',
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    return {
        transporter,
        from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
        to: toList
    };
}

async function generateAndSendDailyReports() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { start, end } = getDayRange(yesterday);
    console.log(`[Daily Email Reports] Generating reports for createdAt >= ${start.toISOString()} and < ${end.toISOString()}`);

    const [onlinePaidPlacedOrders, codPendingOrders, pendingCarts] = await Promise.all([
        Order.find({
            paymentMethod: 'online',
            paymentStatus: 'paid',
            orderStatus: 'placed',
            createdAt: { $gte: start, $lt: end }
        }).populate('items.product').lean(),
        Order.find({
            paymentMethod: 'cod',
            paymentStatus: 'partial_paid',
            orderStatus: 'placed',
            createdAt: { $gte: start, $lt: end }
        }).populate('items.product').lean(),
        Cart.find({
            status: 'active',
            createdAt: { $gte: start, $lt: end }
        }).populate('items.product').lean()
    ]);

    const orderProfiles = await getProfilesByPhone([
        ...onlinePaidPlacedOrders.map(o => getOrderPhone(o)),
        ...codPendingOrders.map(o => getOrderPhone(o))
    ]);
    const cartProfiles = await getProfilesByPhone(pendingCarts.map(c => c.phoneNumber));

    const onlineRows = [];
    for (const order of onlinePaidPlacedOrders) {
        const profile = orderProfiles.get(getOrderPhone(order));
        for (const item of (order.items || [])) {
            onlineRows.push({
                order,
                profile,
                item
            });
        }
        if (!order.items || order.items.length === 0) {
            onlineRows.push({ order, profile, item: null });
        }
    }

    const codRows = [];
    for (const order of codPendingOrders) {
        const profile = orderProfiles.get(getOrderPhone(order));
        for (const item of (order.items || [])) {
            codRows.push({
                order,
                profile,
                item
            });
        }
        if (!order.items || order.items.length === 0) {
            codRows.push({ order, profile, item: null });
        }
    }

    const cartRows = [];
    for (const cart of pendingCarts) {
        const profile = cartProfiles.get(cart.phoneNumber);
        for (const item of (cart.items || [])) {
            cartRows.push({
                cart,
                profile,
                item
            });
        }
        if (!cart.items || cart.items.length === 0) {
            cartRows.push({ cart, profile, item: null });
        }
    }

    const orderColumns = [
        { header: 'OrderNumber', get: r => r.order.orderNumber || '' },
        { header: 'OrderStatus', get: r => r.order.orderStatus || '' },
        { header: 'FirstName', get: r => (r.profile && r.profile.firstName) || '' },
        { header: 'LastName', get: r => (r.profile && r.profile.lastName) || '' },
        { header: 'EmailId', get: r => r.order.emailId || '' },
        { header: 'PhoneNumber', get: r => getOrderPhone(r.order) },
        { header: 'ItemProductId', get: r => (r.item && r.item.product && r.item.product._id) ? String(r.item.product._id) : '' },
        { header: 'ItemProductCode', get: r => (r.item && r.item.product && r.item.product.productCode) || '' },
        { header: 'ItemProductName', get: r => (r.item && r.item.product && r.item.product.name) || '' },
        { header: 'ItemCategory', get: r => (r.item && r.item.product && r.item.product.category) || '' },
        { header: 'ItemUnitPrice', get: r => (r.item && r.item.price) ?? '' },
        { header: 'ItemQuantity', get: r => (r.item && r.item.quantity) ?? '' },
        { header: 'ItemTotalPrice', get: r => (r.item && r.item.totalPrice) ?? '' },
        { header: 'OrderTotalAmount', get: r => r.order.totalAmount ?? '' },
        { header: 'PaymentMethod', get: r => r.order.paymentMethod || '' },
        { header: 'PaymentStatus', get: r => r.order.paymentStatus || '' },
        { header: 'ShipToName', get: r => (r.order.shippingAddress && r.order.shippingAddress.fullName) || '' },
        { header: 'ShipToPhone', get: r => safePhone(r.order.shippingAddress && r.order.shippingAddress.phone) },
        { header: 'ShipToAddress1', get: r => (r.order.shippingAddress && r.order.shippingAddress.addressLine1) || '' },
        { header: 'ShipToAddress2', get: r => (r.order.shippingAddress && r.order.shippingAddress.addressLine2) || '' },
        { header: 'ShipToCity', get: r => (r.order.shippingAddress && r.order.shippingAddress.city) || '' },
        { header: 'ShipToState', get: r => (r.order.shippingAddress && r.order.shippingAddress.state) || '' },
        { header: 'ShipToPostalCode', get: r => (r.order.shippingAddress && r.order.shippingAddress.postalCode) || '' },
        { header: 'CreatedAt', get: r => formatDateTime(r.order.createdAt) }
    ];

    const cartColumns = [
        { header: 'CartStatus', get: r => r.cart.status || '' },
        { header: 'PhoneNumber', get: r => safePhone(r.cart.phoneNumber) },
        { header: 'EmailId', get: r => r.cart.emailId || '' },
        { header: 'FirstName', get: r => (r.profile && r.profile.firstName) || '' },
        { header: 'LastName', get: r => (r.profile && r.profile.lastName) || '' },
        { header: 'ProductCode', get: r => (r.item && r.item.product && r.item.product.productCode) || '' },
        { header: 'ProductId', get: r => (r.item && r.item.product && r.item.product._id) ? String(r.item.product._id) : '' },
        { header: 'ProductName', get: r => (r.item && r.item.product && r.item.product.name) || '' },
        { header: 'ProductCategory', get: r => (r.item && r.item.product && r.item.product.category) || '' },
        { header: 'ShipToName', get: r => (r.cart.shippingAddress && r.cart.shippingAddress.fullName) || '' },
        { header: 'ShipToPhone', get: r => safePhone(r.cart.shippingAddress && r.cart.shippingAddress.phone) },
        { header: 'ShipToCity', get: r => (r.cart.shippingAddress && r.cart.shippingAddress.city) || '' },
        { header: 'ShipToState', get: r => (r.cart.shippingAddress && r.cart.shippingAddress.state) || '' },
        { header: 'ShipToPostalCode', get: r => (r.cart.shippingAddress && r.cart.shippingAddress.postalCode) || '' },
        { header: 'CouponCode', get: r => r.cart.couponCode || '' },
        { header: 'ItemUnitPrice', get: r => (r.item && r.item.price) ?? '' },
        { header: 'ItemQuantity', get: r => (r.item && r.item.quantity) ?? '' },
        { header: 'ItemTotalPrice', get: r => (r.item && r.item.totalPrice) ?? '' },
        { header: 'CartShippingCost', get: r => r.cart.shippingCost ?? '' },
        { header: 'CartDiscountAmount', get: r => r.cart.discountAmount ?? '' },
        { header: 'CartTaxAmount', get: r => r.cart.taxAmount ?? '' },
        { header: 'CartSubtotal', get: r => r.cart.subtotal ?? '' },
        { header: 'CartTotalAmount', get: r => r.cart.totalAmount ?? '' },
        { header: 'PaymentMethod', get: r => r.cart.paymentMethod || '' },
        { header: 'PaymentStatus', get: r => r.cart.paymentStatus || '' },
        { header: 'CreatedAt', get: r => formatDateTime(r.cart.createdAt) }
    ];

    const dateTag = start.toISOString().slice(0, 10); // YYYY-MM-DD

    const onlineCsv = toCsv(onlineRows, orderColumns);
    const codCsv = toCsv(codRows, orderColumns);
    const cartsCsv = toCsv(cartRows, cartColumns);

    const { transporter, from, to } = makeMailer();

    const subject = `Daily Reports (${dateTag}) - Orders & Pending Carts`;
    const text = [
        `Daily reports for ${dateTag}.`,
        '',
        `Online paid placed orders: ${onlinePaidPlacedOrders.length}`,
        `COD pending orders: ${codPendingOrders.length}`,
        `Pending carts: ${pendingCarts.length}`,
        '',
        'Attachments:',
        `- online_paid_placed_orders_${dateTag}.csv`,
        `- cod_pending_orders_${dateTag}.csv`,
        `- pending_carts_${dateTag}.csv`
    ].join('\n');

    await transporter.sendMail({
        from,
        to,
        subject,
        text,
        attachments: [
            {
                filename: `online_paid_placed_orders_${dateTag}.csv`,
                content: onlineCsv,
                contentType: 'text/csv'
            },
            {
                filename: `cod_pending_orders_${dateTag}.csv`,
                content: codCsv,
                contentType: 'text/csv'
            },
            {
                filename: `pending_carts_${dateTag}.csv`,
                content: cartsCsv,
                contentType: 'text/csv'
            }
        ]
    });

    console.log('[Daily Email Reports] Email sent successfully.');
}

const startDailyEmailReportsCron = () => {
    const { DAILY_REPORTS_CRON = '0 9 * * *' } = config

    cron.schedule(
        DAILY_REPORTS_CRON,
        async () => {
            try {
                console.log(`[Daily Email Reports] Triggered at ${new Date().toISOString()}`);
                await generateAndSendDailyReports();
            } catch (err) {
                console.error('[Daily Email Reports] Failed:', err);
            }
        },
        { timezone: 'Asia/Kolkata' }
    );

    console.log(`[Daily Email Reports] Scheduled: "${DAILY_REPORTS_CRON}" `);
};

module.exports = { startDailyEmailReportsCron, generateAndSendDailyReports };

