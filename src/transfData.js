/**
* Cron is a tool that allows you to execute something on a schedule.
* @const CronJob
*/
const CronJob = require('cron').CronJob;

/**
* File management module.
* @const fs
*/
const fs = require('fs');

/**
* node-serialport library to read a stream of messages from a GlobalSat BU-353 USB GPS receiver.
* @const nmea
*/
const nmea = require('@drivetech/node-nmea')

/**
* InfluxDB is an open source time series database.
* @const influx
*/
const influx = require("influx");

/**
* InfluxDB database name
* @const DATABASE_NAME
*/
const DATABASE_NAME = 'weatherStationDB'

/**
* @description Initializing the influxDB database
*/
const influxClient = new influx.InfluxDB({});
influxClient.getDatabaseNames()
  .then(names => {
    if (!names.includes(DATABASE_NAME)) {
      return influxClient.createDatabase(DATABASE_NAME);
    }
  })


/**
* @function
* @name translateJson2InfluxText
* @description Transform a json in a string which then can be read by InfluxDB
* @param {json} jsonSrc
* @returns {void}
*/
function translateJson2InfluxText(jsonSrc){
    let fileText = '# DML \n# CONTEXT-DATABASE: pirates \n# CONTEXT-RETENTION-POLICY: oneyear; \n\n' //oneday

    for(let mes of jsonSrc.measure){
      let stringMes = mes.name + " ";
      stringMes += ",unit='" + mes.unit + "' ";
      stringMes += ",desc='" + mes.desc + "' ";
      stringMes += "value=" + mes.value;
      stringMes += " " + Date.parse(jsonSrc.date);

      fileText += stringMes + "\n";
    }

    console.log(fileText);
};


/**
* @function
* @name translate_Json_InfluxPoint
* @description Create an Array storing future influxDB rows
* @param {json} jsonSrc
* @returns {Array<json>}
*/
function translate_Json_InfluxPoint(jsonSrc){
  let listInfluxPoints = new Array();

  for(let mes of jsonSrc.measure){
    let influxPoint = {
          measurement: mes.name,
          tags: { unit: mes.unit, desc: mes.desc },
          fields: { value: mes.value},
          timestamp: Date.parse(jsonSrc.date)
    };
    listInfluxPoints.push(influxPoint);
  }

  return(listInfluxPoints);
}


/**
* @function
* @name writerInflux
* @description Write sensors data in the database
* @param {string} input_file file path
* @returns {void}
*/
function writerInflux(input_file){

  let textSrc = fs.readFileSync(input_file).toString();
  let jsonObject = JSON.parse(textSrc);
  let listPoints = translate_Json_InfluxPoint(jsonObject);
  console.log("Writing sensors data in the database")

  for (var i = 0; i < listPoints.length; i++) {
    influxClient.writePoints([
    {
      measurement: listPoints[i]['measurement'],
      tags: {'description' : listPoints[i]['tags']['desc'], 'units' : listPoints[i]['tags']['unit']},
      fields: {value : parseInt(listPoints[i]['fields']['value'])},
      timestamp: listPoints[i]['timestamp'],
    }
    ], {
      database: DATABASE_NAME,
      precision: 'ms',
    }).catch(err => {
      console.error(`Error saving data to InfluxDB! ${err.stack}`)
    });
  }

}


/**
* @function
* @name writerInflux_GPS
* @description Write GPS data in the database
* @param {string} input_file file path
* @returns {void}
*/
function writerInflux_GPS(input_file){
  let textSrc = fs.readFileSync(input_file).toString();
  let arrayOfLines = textSrc.match(/[^\r\n]+/g);
  console.log("Writing GPS data in the database")
  for(var i = 0; i < arrayOfLines.length; i++){
    let data = nmea.parse(arrayOfLines[1])
    let date = Date.parse(data.datetime);
    let lat = data.loc['geojson']['coordinates'][1];
    let lng = data.loc['geojson']['coordinates'][0];

    influxClient.writePoints([
    {
      measurement: 'coordinate',
      tags: {'longitude' : lng, 'latitude' : lat},
      fields: {value : data.valid},
      timestamp: date,
    }
    ], {
      database: DATABASE_NAME,
      precision: 'ms',
    }).catch(err => {
      console.error(`Error saving data to InfluxDB! ${err.stack}`)
    });
  }
}


/**
* @function
* @name writerInflux_rain
* @description Write rain data in the database
* @param {string} input_file file path
* @returns {void}
*/
function writerInflux_rain(input_file){
  let textSrc = fs.readFileSync(input_file).toString();
  let arrayOfLines = textSrc.match(/[^\r\n]+/g);
  let date = Date.parse(new Date(arrayOfLines[0]));
  console.log("Writing rain data in the database")
  influxClient.writePoints([
  {
    measurement: 'rain',
    tags: {'description' : "Dates des basculements", 'units' : 'mm/m²'},
    fields: {value : 0.32},
    timestamp: date,
  }
  ], {
    database: DATABASE_NAME,
    precision: 'ms',
  }).catch(err => {
    console.error(`Error saving data to InfluxDB! ${err.stack}`)
  });
}


/**
* @description Write data in the InfluxDB database every 20 minutes
*/
var job = new CronJob('0/20 * * * *', function() {
  writerInflux('/dev/shm/sensors');
  writerInflux_GPS("/dev/shm/gpsNmea");
  writerInflux_rain("/dev/shm/rainCounter.log")
}, null, true, 'America/Los_Angeles');
job.start();
