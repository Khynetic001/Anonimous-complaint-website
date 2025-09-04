const mongoose = require("mongoose");
const Complaint = require("./models/Complaint"); // your schema

exports.handler = async (event) => {
  try {
    const { complaintId } = JSON.parse(event.body);

    if (!complaintId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Complaint ID required" }) };
    }

    // connect to DB (ensure mongoose connection utility is used)
    await mongoose.connect(process.env.MONGODB_URI);

    const complaint = await Complaint.findOne({ complaintId });

    if (!complaint) {
      return { statusCode: 404, body: JSON.stringify({ message: "Complaint not found" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(complaint)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
