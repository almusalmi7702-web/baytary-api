const jsonServer = require('json-server');
const jsonGraphqlServer = require('json-graphql-server').default;
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const data = require('./db.json');

app.use(cors());
app.use(express.json());

// بوابة GraphQL: هي اللي بتفهم الـ 600 سطر استعلام
app.use('/graphql', jsonGraphqlServer(data));

// بوابة REST: عشان الصور وتسجيل الدخول (api/v1)
app.use('/api/v1', jsonServer.router('db.json'));

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});