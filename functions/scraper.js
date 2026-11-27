const admin = require("firebase-admin");

if (admin.apps.length === 0) {
    admin.initializeApp();
}

async function executeTM30Submission(appId, submissionDocId) {
    const db = admin.firestore();

    const docRef = db.collection("artifacts").doc(appId).collection("public").doc("data").collection("submissions").doc(submissionDocId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
        throw new Error(`Target submission ${submissionDocId} not found.`);
    }

    // Note: Telegram notification removed from here so we rely on index.js for detailed summaries.
    await docRef.update({
        status: "manual_action_required",
        processedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, mode: "live_desk" };
}

module.exports = { executeTM30Submission };
