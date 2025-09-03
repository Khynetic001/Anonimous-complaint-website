// netlify/functions/submitComplaint.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI; // Add in Netlify Environment Variables
let client = null;

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    if (!data.complaintId || !data.department || !data.program || !data.title || !data.details) {
      return { statusCode: 400, body: "Missing fields" };
    }

    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }
    const db = client.db("complaintsDB");
    const complaints = db.collection("complaints");

    await complaints.insertOne({
      complaintId: data.complaintId,
      department: data.department,
      program: data.program,
      title: data.title,
      details: data.details,
      createdAt: new Date()
      status: "pending"
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Complaint stored successfully" })
    };
  } catch (err) {
    return { statusCode: 500, body: err.toString() };
  }
};
