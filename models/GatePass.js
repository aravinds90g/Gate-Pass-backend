const mongoose = require("mongoose");

const GatePassSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  rollNo: { type: String }, 
  name: { type: String }, // Name of the student
  dept: { type: String }, // Department of the student
  year: { type: Number }, // Year of the student
  reason: { type: String, required: true },
  date: { type: String }, // Date of leaving
  time: { type: String }, // Time of leaving
  forwarded: { type: Boolean, default: false }, // Whether the pass has been forwarded to the admin
  forwardedAt: { type: Date }, // Date when the pass was forwarded
  destination: { type: String }, // Destination of the student
  comingDate: { type: String }, // Date of coming back
  customReason: { type: String }, // Custom reason if "Other" is selected
  reasonForGoingHome: { type: String }, // Reason for going home if "Home" is selected
  parentName: { type: String }, // Parent's name if "Home" is selected
  parentContact: { type: String }, // Parent's contact number if "Home" is selected
  status: {
    type: String,
    enum: ["pending", "active", "rejected", "expired", "approved"],
    // ✅ Enum values for status
    default: "pending",
    lowercase: true, // ✅ Automatically converts input to lowercase
  },
  approvedBy: { type: String}, // Mentor/Warden who approved
  rejectedBy: { type: String }, // Mentor/Warden who rejected
  rejectedAt: { type: Date }, // Date when the pass was rejected
  approvedAt: { type: Date }, // Date when the pass was approved
  activedAt: { type: Date }, // Date when the pass was activated
  expiredAt: { type: Date }, // Date when the pass expired
  appliedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("GatePass", GatePassSchema);
