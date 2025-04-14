const GatePass = require("../models/GatePass");
const User = require("../models/User");

// Apply for a gate pass
exports.createGatePass = async (req, res) => {
  try {
    const {
      email,
      reason,
      date,
      time,
      destination,
      comingDate,
      parentName,
      parentContact,
      customReason,
      reasonForGoingHome,
    } = req.body;
    console.log("📩 Received data:", req.body);

    // Extract email from the authenticated user
    // console.log("🔍 Searching for email:", email);
   

    // Search for the student in the database
    const student = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") }, // Case-insensitive match
    }).exec();

    if (!student) {
      console.log("❌ Student not found!");
      return res.status(404).json({ message: "Student not found!" });
    }

    // console.log("✅ Student found:", student);

    // Create new gate pass
    const gatePass = new GatePass({
      student: student._id,
      year: student.year,
      dept: student.dept,
      rollNo: student.rollNo,
      name: student.name,
      destination,
      reason,
      date,
      time,
      forwarded: false, // Default to false
      forwardedAt: null, // Initially null, to be set when forwarded
      comingDate, // Default to the same date if not provided
      parentName,
      parentContact,
      reasonForGoingHome, // Set if "Home" is selected
      customReason, // Parent's contact number if "Home" is selected
      approvedBy: null, // Initially null, to be set when approved
      rejectedBy: null, // Initially null, to be set when rejected
      rejectedAt: null, // Initially null, to be set when rejected
      approvedAt: null, // Initially null, to be set when approved
      expiredAt: null, // Initially null, to be set when expired
      activedAt: null, // Initially null, to be set when activated
      status: "pending", // Default status
    });

    await gatePass.save();

    res
      .status(201)
      .json({ message: "Gate pass created successfully!", gatePass });
  } catch (error) {
    console.error("🔥 Server error:", error);
    res.status(500).json({ message: "Server error", error });
  }
};


// Get all gate passes
exports.getAllGatePasses = async (req, res) => {
  try {
    const gatePasses = await GatePass.find().populate(
      "student",
      "name rollNo dept year"
    );
    res.status(200).json(gatePasses);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Get a specific gate pass by email
exports.getGatePassesByEmail = async (req, res) => {
  try {
    const { email } = req.query; // <-- Change from req.body to req.query
    const student = await User.findOne({ email });
    if (!student) {
      return res.status(404).json({ message: "Student not found!" });
    }

    const gatePasses = await GatePass.find({ student: student._id }).populate(
      "student",
      "name rollNo dept year email"
    );

    res.status(200).json(gatePasses);
  } catch (error) {
    console.error("Error fetching gate passes by email:", error);
    res.status(500).json({ message: "Server error", error });
  }
};
//get by id
exports.getGatePassById = async (req, res) => {
  try {
    const { id } = req.params;
    const gatePass = await GatePass.findById(id).populate(
      "student",
      "name rollNo dept year email"
    );

    if (!gatePass) {
      return res.status(404).json({ message: "Gate pass not found!" });
    }

    res.status(200).json(gatePass);
  } catch (error) {
    console.error("Error fetching gate pass by ID:", error);
    res.status(500).json({ message: "Server error", error });
  }
}


// Approve a gate pass
exports.updateGatePass = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body; // Get all update fields from request body

    // Validate that there's data to update
    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No update data provided" });
    }

    // Optionally: Define allowed fields that can be updated

    console.log("📩 Received data:", updateData.approvedBy);
    
    const allowedUpdates = [
      "status",
      "approvedBy",
      "rejectedBy",
      "expiredAt",
      "activedAt",
      "rejectedAt",
      "approvedAt",
      "forwarded",
      "forwardedAt",
    ]; // Add your actual fields
    const isValidOperation = Object.keys(updateData).every((field) =>
      allowedUpdates.includes(field)
    );

    if (!isValidOperation) {
      return res.status(400).json({ message: "Invalid updates!" });
    }

    const gatePass = await GatePass.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true } // Return updated doc and run schema validators
    );

    if (!gatePass) {
      return res.status(404).json({ message: "Gate pass not found" });
    }

    res.status(200).json({
      success: true,
      message: "Gate pass updated successfully",
      gatePass,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating gate pass",
      error: error.message,
    });
  }
};


// Get passes by department and year
exports.getGatePassByDeptAndYear = async (req, res) => {
  try {
    const { dept, year } = req.query; // Get department and year from query parameters

    console.log("📩 Received data:", req.query);

    // Validate input
    if (!dept || !year) {
      return res.status(400).json({ message: "Department and year are required" });
    }



    const gatePasses = await GatePass.find({ dept , year , status:"pending" , reason:"Home" , forwarded: false }).populate(
      "student",
      "name rollNo dept year email"
    );

    if (gatePasses.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(gatePasses);
  } catch (error) {
    console.error("Error fetching gate passes by department and year:", error);
    res.status(500).json({ message: "Server error", error });
  }
};