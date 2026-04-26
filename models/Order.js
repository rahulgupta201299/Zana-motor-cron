const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    fullName: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    postalCode: String
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BikeProduct'
    },
    quantity: Number,
    price: Number
}, { _id: false });

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: true
    },
    emailId: String,
    items: [orderItemSchema],
    shippingAddress: addressSchema,
    shippingCost: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    paymentMethod: String,
    advancePaid: Number,
    paymentStatus: String,
    orderStatus: String,
    orderDate: {
        type: Date,
        default: Date.now
    },
    logisticsReferenceId: String,
    logisticsOrderId: String,
    logisticsAWBNumber: String
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
