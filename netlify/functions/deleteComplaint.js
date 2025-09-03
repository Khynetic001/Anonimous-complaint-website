// netlify/functions/deleteComplaint.js
const { MongoClient, ObjectId } = require("mongodb");

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

exports.handler = async (event) => {
  try {
    const { id } = JSON.parse(event.body);

    await client.connect();
    const db = client.db("complaintsDB");

    await db.collection("complaints").deleteOne({ _id: new ObjectId(id) });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Complaint deleted" }),
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
