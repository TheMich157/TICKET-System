const mongoose = require('mongoose');

const actionLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true
    },
    performedBy: {
        type: String,
        required: true
    },
    target: {
        type: String,
        required: false
    },
    details: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ActionLog', actionLogSchema);
