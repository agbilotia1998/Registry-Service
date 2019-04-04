let express = require('express');
let bodyParser = require('body-parser');
let cookieParser = require('cookie-parser');
let mongoose = require('mongoose');
let schema = mongoose.Schema;
let app = express();
let cors = require('cors');
let RateLimit = require('express-rate-limit');
let RedisStore = require('rate-limit-redis');
let redis = require('redis');
let request = require('request');
let parametersSchema = new schema({
  parameterPosition: Number,
  parameterType: String
}, { _id : false });
let serverSchema = new schema({
  ip: String,
  numberOfRequests: Number
}, { _id : false });
let serviceSchema = new schema({
  serviceName: String,
  parameters: [parametersSchema],
  serverAddress: [serverSchema],
  returnType: String
});
let services = mongoose.model("service", serviceSchema);
const DB_URL = process.env.DB || "mongodb://localhost:27017/serviceProvider";

app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors());
mongoose.connect(DB_URL, function(err, res) {
  if(!err) {
    console.log("Connected to Registry service database");
  }
});
mongoose.Promise = global.Promise;

const client = redis.createClient('redis://localhost:6379');
const expireInSeconds = 10;
const requestLimit = 10;
const rateLimiter = new RateLimit({
  store: new RedisStore({
    client: client,
    expiry: expireInSeconds
  }),
  windowMs: 1000 * expireInSeconds,
  max: requestLimit
});

function getServer(response) {
  let minimum = Number.MAX_SAFE_INTEGER;
  let result = null;
  let count = 0, index = 0;

  response.serverAddress.forEach((server) => {
    if(server.numberOfRequests <= minimum) {
      result = server.ip;
      index = count;
      minimum = server.numberOfRequests;
    }
    count += 1;
  });
  response.serverAddress = result;

  return {
    service: response,
    index: index
  };
}

app.use(rateLimiter);
app.get('/', function(req, res) {
  res.send('Welcome to Registry Service');
});

app.get('/all-procedures', (req, res) => {
  services.find({}, {serviceName:1}, (err, response) => {
    let procedureNames = response.map(element => element.serviceName);

    res.send(procedureNames);
  })
});

app.post('/map', function(req, res) {
  // let data = {
  //   serviceName: "add",
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
  let serviceName = data.serviceName;
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
    returnType: returnType
  };
  let servers = [];
  let serverData = {
    ip: data.server,
    numberOfRequests: 0
  };

  services.findOne({'serviceName': serviceName, 'parameters': allParams}, {serverAddress:1}, (err, response) => {
    if(!err && response) {
      servers = response.serverAddress;
    }
    let index = JSON.stringify(servers).indexOf(JSON.stringify(serverData));

    if(index === -1) {
      servers.push(serverData);
    }
    service.serverAddress = servers;
    services.update({'serviceName': serviceName, 'parameters': allParams}, service, {upsert: true}, (err, response) => {
      if (!err) {
        res.send(response);
      }
    });
  });
});

app.get('/service-provider', function(req, res) {
  // let data = {
  //   serviceName: "addition",
  //   parameters: [{
  //     parameterPosition: 1,
  //     parameterType: "int"
  //   }, {
  //       parameterPosition: 2,
  //       parameterType: "int"
  //     }, {
  //       parameterPosition: 3,
  //       parameterType: "string"
  //     }]
  // };

  let requestedService = JSON.parse(req.headers.data);
  services.findOne(requestedService, function(err, resp) {
    let modifiedResp = JSON.parse(JSON.stringify(resp));
    let server = getServer(modifiedResp);
    let service = server.service;
    let index = server.index;

    console.log(service.serverAddress);
    if(!err && service) {
      request.get(service.serverAddress + '/active', function (request, response) {
        if(response) {
          response = JSON.parse(response.body);
          if (response.result === true) {
            console.log(service);
            res.status(200).send(service);
            let modifiedServerEntry = resp;

            modifiedServerEntry.serverAddress[index].numberOfRequests += 1;
            console.log(modifiedServerEntry.serverAddress[index].numberOfRequests)
            console.log(modifiedServerEntry);
            services.updateOne(requestedService, modifiedServerEntry, function(err, updateResponse) {
              console.log(updateResponse);
            });
          }
        } else{
          services.update(resp, { $pull: {serverAddress: { ip: service.serverAddress }} }, function(err, deleteResponse) {
            console.log(deleteResponse);
          });
          res.status(503).send(JSON.stringify({message: "Please retry"}));
        }
      });
    } else {
     res.status(400).send({Message: 'Not found'});
    }
  });
});

let listener = app.listen(process.env.PORT || 8000, function(err) {
  if(!err) {
    console.log('Registry server started on PORT ' + listener.address().port);
  }
});
