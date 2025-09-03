// netlify/functions/getComplaints.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI; // put your MongoDB URI in Netlify environment variables
const client = new MongoClient(uri);

exports.handler = async () => {
  try {
    await client.connect();
    const db = client.db("complaintsDB"); // change DB name if needed
    const complaints = await db.collection("complaints")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return {
      statusCode: 200,
      body: JSON.stringify(complaints),
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
