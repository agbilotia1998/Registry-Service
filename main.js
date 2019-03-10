let express = require('express');
let bodyParser = require('body-parser');
let cookieParser = require('cookie-parser');
let mongoose = require('mongoose');
let schema = mongoose.Schema;
let app = express();
let parametersSchema = new schema({
  parameterPosition: Number,
  parameterType: String
},{ _id : false });
let serviceSchema = new schema({
  serviceName: String,
  parameters: [parametersSchema],
  serverAddress: String,
  returnType: String
});
let services = mongoose.model("service", serviceSchema);
const PORT = process.env.port || 8000;
const DB_URL = 'mongodb://localhost/serviceProvider';

app.use(bodyParser.json());
app.use(cookieParser());
mongoose.connect(DB_URL, function(err, res) {
  if(!err) {
    console.log("Connected to Registry service database");
  }
});
mongoose.Promise = global.Promise;

app.get('/', function(req, res) {
  res.send('Welcome to Registry Service');
});

app.get('/all-procedures', (req, res) => {
  services.find({}, {name:1}, (err, res) => {
    let procedureNames = res.map(element => element.name);

    res.send(procedureNames);
  })
});

app.post('/map', function(req, res) {
  // let data = {
  //   name: "add",
  //   parameters: [{
  //     position: 1,
  //     type: "int"
  //   }, {
  //       position: 2,
  //       type: "int"
  //     }],
  //   server: "http://localhost:7000",
  //   returnType: "int"
  // };
  let data = req.body;
  let serviceName = data.name;
  let server = data.server;
  let parameters = data.parameters;
  let returnType = data.returnType;
  let allParams = [];

  for(let index in parameters) {
    const parameter = {
      parameterPosition: parameters[index]['position'],
      parameterType: parameters[index]['type']
    };

    allParams.push(parameter);
  }
  let service = {
    serviceName: serviceName,
    parameters: allParams,
    serverAddress: server,
    returnType: returnType
  };

  console.log(service);

  services.update({'name': serviceName, 'parameters': allParams}, service, {upsert: true}, (err, response) => {
    if (!err) {
      res.send(response);
    }
  });
});

app.get('/service-provider', function(req, res) {
  // let data = {
  //   name: "addition",
  //   parameters: [{
  //     position: 1,
  //     type: "int"
  //   }, {
  //       position: 2,
  //       type: "int"
  //     }, {
  //       position: 3,
  //       type: "string"
  //     }]
  // };

  let service = JSON.parse(req.headers.data);
  console.log(service);
  services.findOne(service, function(err, service) {
    if(!err && service) {
      res.status(200).send(service);
    } else {
     res.status(400).send({Message: 'Not found'});
    }
  });
});

app.listen(PORT, function(err) {
  if(!err) {
    console.log('Registry server started');
  }
});
