const mongoose = require('mongoose');

const bikeProductSchema = new mongoose.Schema({
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BikeBrand'
    },
    model: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BikeModel'
    },
    isBikeSpecific: {
        type: Boolean,
        default: true
    },
    isNewArrival: {
        type: Boolean,
        default: false
    },
    isGarageFavorite: {
        type: Boolean,
        default: false
    },
    name: {
        type: String,
        required: true
    },
    productCode: {
        type: String
    },
    category: {
        type: String
    },
    price: {
        type: Number
    },
    imageUrl: {
        type: String
    },
    images: [{
        type: String
    }],
    quantityAvailable: {
        type: Number
    },
    specifications: {
        type: String
    },
    shippingAndReturn: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('BikeProduct', bikeProductSchema);