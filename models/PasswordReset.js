const mongoose = require("mongoose");

const PasswordResetSchema = new mongoose.Schema({
  userId: {
    type: String,
  },
  resetString: {
    type: String,
  },
  createdAt: {
    type: Date,
  },
  expiresAt: {
    type: Date,
  },
});

const UserVerification = mongoose.model("PasswordReset", PasswordResetSchema);

module.exports = UserVerification;
