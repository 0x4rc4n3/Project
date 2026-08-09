process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import { issueRoute } from './routes/issue.js';
import { statusRoute } from './routes/status.js';
import { verifyRoute } from './routes/verify.js';
import { healShards } from './db/models.js';

const app = express();
app.use(express.json());

app.post('/issue', issueRoute);
app.get('/status/:id', statusRoute);
app.post('/verify', verifyRoute);
app.post('/heal-shards', async (req, res) => {
  const { nodeId } = req.body || {};
  const events = await healShards(nodeId);
  res.json({ success: true, events });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Verification API listening on port ${PORT}`);
});
