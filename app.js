const path = require('path');
const express = require('express');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.disable('etag');

// Product/category images referenced by the API's *_path fields (served by Apache in the PHP setup).
app.use('/uploaded_files', express.static(env.uploadDir, { index: false }));
// Fallback image URL returned by get_image() (assets/developers/images/noimg1.gif).
app.use('/assets/developers/images', express.static(path.join(__dirname, 'assets', 'developers', 'images'), { index: false }));

app.use(routes);

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

app.use(errorHandler);

module.exports = app;
