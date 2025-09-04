const { MongoClient, ObjectId } = require("mongodb");
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

exports.handler = async (event) => {
  try {
    const { id, action } = JSON.parse(event.body);

    // Map frontend actions to statuses
    let status = action;
    if (action === "approve") status = "approved";
    if (action === "reject") status = "rejected";

    await client.connect();
    const db = client.db("complaintsDB");

    await db.collection("complaints").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: `Complaint ${status}` }),
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
