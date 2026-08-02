/**
 * InterviewXpert REST API Server — entrypoint for long-lived Node process.
 * The Express app itself lives in app.js (shared with the AWS Lambda handler).
 */
import app from './app.js'; // (app.js already loads cognitoConfig.js / env)

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 REST API Integration Server running on port ${PORT}`);
});
