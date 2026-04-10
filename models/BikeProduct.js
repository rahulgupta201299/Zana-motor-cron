const mongoose = require('mongoose');

const bikeProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    productCode: {
        type: String
    },
    category: {
        type: String
    }
});

module.exports = mongoose.model('BikeProduct', bikeProductSchema);
