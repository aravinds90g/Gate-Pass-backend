const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
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
