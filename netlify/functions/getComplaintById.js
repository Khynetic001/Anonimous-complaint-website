// netlify/functions/getComplaintById.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

exports.handler = async (event) => {
  try {
    const { complaintId } = JSON.parse(event.body);

    if (!complaintId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "complaintId is required" }),
      };
    }

    await client.connect();
    const db = client.db("complaintsDB");
    const complaint = await db.collection("complaints").findOne({ complaintId });

    if (!complaint) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Complaint not found" }),
      };
    }

    // Return only safe fields
    return {
      statusCode: 200,
      body: JSON.stringify({
        complaintId: complaint.complaintId,
        title: complaint.title,
        status: complaint.status || "pending", // default if not set
        createdAt: complaint.createdAt,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  } finally {
    await client.close();
  }
};
