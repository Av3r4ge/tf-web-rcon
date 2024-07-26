const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Log = new Schema({
    timestamp: {
        type: Number,
        required: true,
    },
    executor: {
        type: String,
        required: true,
    },
    command: {
        type: String,
        required: true,
    }
})


const logModel = mongoose.model('log', Log)
module.exports = logModel
