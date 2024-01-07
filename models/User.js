const mongoose = require('mongoose');


const UserSchema = new mongoose.Schema({
  name: {
    type: String,
  },
  email: {
    type: String,
  },
  password: {
    type: String,
  },
  verified: {
    type: Boolean
  }
});

const User = mongoose.model('User', UserSchema);

module.exports = User;