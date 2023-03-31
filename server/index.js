require("dotenv").config();

const { SerialPortSocket } = require("./lib/serialport");
const { routes } = require("./routes/api");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const mqtt = require("mqtt");
const NodeWebCam = require('node-webcam')

const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  },
});

app.use(helmet());
app.use(bodyParser.json());
app.use(cors());
app.use(morgan("combined"));

SerialPortSocket.init();

const mqttHost = "193.168.195.119";
const mqttPort = "1883";
const mqttClientId = `mqtt_${Math.random().toString(16).slice(3)}`;
const SerialNode = process.env.SERIAL;
const BACKEND_URL = process.env.BACKEND_URL;
const TMA_MODE = process.env.TMA_MODE;

const TMA_MODES = {
  reverse: "REVERSE",
  normal: "NORMAL"
}

let postData = {};
let currentStatusTma = 4;
let settings = {};
let tmaChange = false;
let isOnline = false;

const checkConnection = async () => {
  require("dns").resolve("www.google.com", function (err) {
    if (err) {
      isOnline = 0;
    } else {
      isOnline = 1;
    }
  });

  await SerialPortSocket.write(`0,0,${isOnline},*`);
}

checkConnection()

let fetchSetting = async () => {
  let telemetrySetting = await fetch(
    `${BACKEND_URL}/node-setting/${SerialNode}`
  );
  let response = await telemetrySetting.json();
  settings = response;
};

// connect options
const MQTT_OPTIONS = {
  mqttClientId,
  clean: true,
  connectTimeout: 4000,
  username: "emqx",
  password: "public",
  reconnectPeriod: 1000,
};

let mqttConnectUrl = `mqtt://${mqttHost}:${mqttPort}`;

const topic = "EWS.Settings." + SerialNode;

const client = mqtt.connect(mqttConnectUrl, MQTT_OPTIONS);

const write = async () => {
  let telemetry = await SerialPortSocket.write("REQ,*");

  console.log("Data Telemetri Diambil");

  let RainBucket = new Date();
  let temperature = parseFloat(telemetry.temp);
  let humidity = parseFloat(telemetry.humidity);
  let pressure = parseFloat(telemetry.pressure);
  let wind_dir = telemetry.wind_direction;
  let wind_speed = parseFloat(telemetry.wind_speed);
  let distance = parseFloat(telemetry.distance);
  let rain_bucket = parseFloat(telemetry.rain_bucket);
  let lux = parseFloat(telemetry.lux);
  let current = telemetry.current;
  let voltage = telemetry.voltage;

  let rain_gauge = function () {
    let rain_gauge_real = 0;

    let RainBucketNow = new Date();
    let globalRain = rain_bucket;

    if ((RainBucketNow - RainBucket) / 60000 >= 1) {
      rain_gauge_real = globalRain / ((RainBucketNow - RainBucket) / 60000);
      rain_gauge_real = rain_gauge_real <= 0 ? 0 : rain_gauge_real;
      rain_gauge_real = rain_gauge_real >= 8 ? 8 : rain_gauge_real;
    }

    return rain_gauge_real;
  };

  let altitude = function () {
    return (
      ((temperature + 273.15) / -0.0065) *
      (Math.pow(
        (pressure * 100) / 101370,
        (-8.31432 * -0.0065) / (9.80665 * 0.0289644)
      ) -
        1)
    );
  };

  let TMA = function () {
    let h0 = parseFloat(settings.h0);
    let h1 = parseFloat(settings.h1);
    let h2 = settings.jarak_maksimal_sensor_tma * 100 - distance;

    return h1 + h0 - h2 <= 0 ? 0 : h1 + h0 - h2;
  };

  let statusTMA = function () {
    let siaga1 = settings.siaga1;
    let siaga2 = settings.siaga2;
    let siaga3 = settings.siaga3;

    if (TMA() < siaga3) {
      return 4;
    }

    if (TMA() >= siaga3 && TMA() < siaga2) {
      return 3;
    }

    if (TMA() >= siaga2 && TMA() < siaga1) {
      return 2;
    }

    if (TMA() > siaga1) {
      return 1;
    }
  };

  tmaChange = currentStatusTma === statusTMA()

  currentStatusTma = statusTMA();

  postData = {
    serial_number: SerialNode,
    tma_level: statusTMA(),
    temperature: temperature,
    humidity: humidity,
    atmospheric_pressure: pressure,
    wind_direction: wind_dir,
    wind_speed: wind_speed,
    rain_gauge: rain_gauge(),
    water_level: TMA(),
    lat: settings.lat,
    lng: settings.lng,
    alt: altitude(),
    result_camera: null,
    current_condition: lux,
    voltage: voltage,
    batery_consumption: 50,
    arus: current,
    debit_air: 0,
  };

  let buzzerOff = true
  let turnOnBuzzer = currentStatusTma === 1 && buzzerOff ? 1 : 0

  let turnOnIndicator

  if (TMA_MODE === TMA_MODES.reverse) {
    turnOnIndicator = postData.tma_level === 4 ? 0 : (postData.tma_level === 1 ? 3 : (postData.tma_level === 3 ? 1 : 2));
  } else if (TMA_MODE === TMA_MODES.normal) {
    turnOnIndicator = postData.tma_level === 4 ? 0 : postData.tma_level;
  }

  let command = `${turnOnIndicator},${turnOnBuzzer},1,*`;

  await SerialPortSocket.write(command);
};

const postToApi = async () => {
  checkConnection()

  NodeWebCam.capture('telemetry', { callbackReturn: "base64" }, async function (err, data) {
    if (err) console.error(err);

    if (!tmaChange) {
      postData.camera = data
    }

    await fetch(`${BACKEND_URL}/telemetry`, {
      method: "POST",
      body: JSON.stringify(postData),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((res) => {
        console.log(res);
      });
  })
};

let timeBasedInterval;
let eventBasedInterval;

client.on("connect", () => {
  console.log(`mqtt: Connected`);
  client.subscribe([topic], async () => {
    console.log(`mqtt: Subscribe to topic '${topic}'`);

    await fetchSetting();

    await SerialPortSocket.setSelectedPort(process.env.PORT);

    if (SerialPortSocket.getSelectedPort() == "") return;

    timeBasedInterval =
      (settings.time_based || settings.time_based == 1) &&
      setInterval(async () => {
        console.log("logged");

        await write();

        await postToApi();
      }, settings.time_based_time * 60000);

    eventBasedInterval =
      (settings.event_based || settings.event_based == 1) &&
      setInterval(async () => {
        console.log("event logged");

        await write();

        console.log("Current Status TMA: " + currentStatusTma);
        console.log("Water Level: " + postData.water_level)

        if (currentStatusTma == 1) {
          await postToApi();

          currentStatusTma = 4;
        }
      }, settings.event_based_time * 1000);
  });
});

client.on("reconnect", (error) => {
  console.log(`Reconnecting(${program.protocol}):`, error);
});

client.on("error", (error) => {
  console.log(`Cannot connect:`, error);
});

client.on("message", (topic, payload) => {
  console.log("Received Message:", topic, payload.toString());

  settings = JSON.parse(payload);
  settings = settings.settings;

  clearInterval(timeBasedInterval);
  clearInterval(eventBasedInterval);

  timeBasedInterval =
    (settings.time_based || settings.time_based == 1) &&
    setInterval(async () => {
      console.log("logged");

      await write();

      console.log("Current Status TMA: " + currentStatusTma)
      console.log("Water Level: " + postData.water_level)

      await postToApi();
    }, settings.time_based_time * 60000);

  eventBasedInterval =
    (settings.event_based || settings.event_based == 1) &&
    setInterval(async () => {
      console.log("event logged");

      await write();

      console.log("STATUS TMA", currentStatusTma)

      if (currentStatusTma == 1) {
        await postToApi();

        currentStatusTma = 4;
      }
    }, settings.event_based_time * 1000);
});

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("get port list", async () => {
    io.emit("get port list", await SerialPortSocket.getPortList());
  });

  socket.on("get selected port", () => {
    io.emit("get selected port", SerialPortSocket.getSelectedPort());
  });

  socket.on("set port", async (port) => {
    await SerialPortSocket.setSelectedPort(port);

    let selectedPort = SerialPortSocket.getSelectedPort();

    io.emit("set port", selectedPort);
  });

  socket.on("write data", async (command) => {
    console.log(command);

    let response = await SerialPortSocket.write(command);

    io.emit("write data", response);
  });

  socket.on("send status", async (command) => {
    console.log(command);

    await SerialPortSocket.write(command);
  });

  socket.on("disconnect", () => {
    console.log("a user disconnected");
  });
});

server.listen(8081, (error) => {
  if (error) throw error;

  console.log("Server created");
});
