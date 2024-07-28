const mongoose = require('mongoose')
const passportLocalMongoose = require('passport-local-mongoose')
const Schema = mongoose.Schema

const User = new Schema({

    username: {
        type: String,
        required: true,
        unique: true
    },

    type: {
        type: String,
        required: true,
        default: 'user'
    },

    isDisabled: {
        type: Boolean,
        required: true,
        default: false
    }

})

User.plugin(passportLocalMongoose)

const userModel = mongoose.model('user', User)
module.exports = userModel
