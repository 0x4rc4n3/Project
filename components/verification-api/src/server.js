import express from 'express';
import { issueRoute } from './routes/issue.js';
import { statusRoute } from './routes/status.js';
import { verifyRoute } from './routes/verify.js';

const app = express();
app.use(express.json());

app.post('/issue', issueRoute);
app.get('/status/:id', statusRoute);
app.post('/verify', verifyRoute);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Verification API listening on port ${PORT}`);
});
