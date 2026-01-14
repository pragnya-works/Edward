import express, { type Request, type Response } from 'express';

const app = express();
const port = 8000;

app.use(express.json());

app.get('/', (_: Request, res: Response) => {
  res.send('Hello TypeScript + Express!');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
