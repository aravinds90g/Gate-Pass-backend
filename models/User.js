const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    // Never selected by default: login opts in explicitly with +password.
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "warden", "security", "mentor", "student"],
      required: true,
    },
    dept: { type: String }, // Only for students & mentors
    year: { type: Number }, // Only for students & mentors
    rollNo: { type: Number, unique: true, sparse: true }, // Only for students
    phoneNo: { type: Number, unique: true, sparse: true }, // Only for students & mentors
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
