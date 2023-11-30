// Set Default Timezone
process.env.TZ = 'Asia/Phnom_Penh'
const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const cron = require('node-cron');
const axios = require('axios')


// Allow close domain
app.use(cors())

// Accept Form Submition
const bodyParser = require('body-parser')
app.use(bodyParser.json()) // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded


// Enable public resource
app.use(express.static('public'))

// Public Folder
app.use('/tmp', express.static('tmp'))
app.use('/pdf', express.static('pdf'))
app.use('/xlsx', express.static('xlsx'))
app.use('/uploads', express.static('uploads'))

// Configuration
const config = require('./app/config/config')

// Testing code 
cron.schedule('*/10 * * * * *', () => {
  axios.get(`${process.env.CRON_URL}`)
});

// Routes
require('./app/config/routes')(app)

app.listen(config.port, () => {
  console.log(`http://localhost:${config.port}`)
})

app.use(function(req, res, next) {
  console.log(req.get('User-Agent'))
  res.locals.ua = req.get('User-Agent');
  next();
})

