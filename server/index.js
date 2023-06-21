require("dotenv").config();

const exec = require("child_process").exec;
const serialport = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const mqtt = require("mqtt");
const NodeWebcam = require("node-webcam");

const SerialPort = serialport.SerialPort;

// Data dari ENV
const mqttHost = process.env.MQTT_HOST;
const mqttPort = process.env.MQTT_PORT;
const mqttClientId = `mqtt_${Math.random().toString(16).slice(3)}`;
const SerialNode = process.env.SERIAL;
const BACKEND_URL = process.env.BACKEND_URL;
const REPEAT = parseInt(process.env.REPEAT);
const TMA_MODE = process.env.TMA_MODE | "REVERSE";

const Webcam = NodeWebcam.create({
  width: 640,
  height: 480,
  delay: 0,
  quality: 100,
  output: "jpeg",
  device: "/dev/video0",
  verbose: false,
  callbackReturn: "base64",
});

// konfigurasi port serial
const port = new SerialPort({
  path: process.env.PORT,
  baudRate: 9600,
});

// konfigurasi parser untuk data dari port serial
const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

let globalSettings = {};
let currentStatus = 0;

const shutdown = () => {
  exec("sudo shutdown -h now", function (exception, output, err) {
    console.log(
      new Date().toLocaleString() +
        " : [NODEJS] Shutdown Exception: " +
        exception
    );
    console.log(
      new Date().toLocaleString() + " : [NODEJS] Shutdown output: " + output
    );
    console.log(
      new Date().toLocaleString() + " : [NODEJS] Shutdown error: " + err
    );
  });
};

// variabel global untuk menyimpan data dari port serial
let parsedData = null;

// konfigurasi pengiriman data ke API setiap 1 menit sekali dengan batas maksimum pengiriman data sebanyak 2 kali
let counter = 0;
const interval = setInterval(() => {
  if (counter < REPEAT) {
    port.write("REQ,*");
    counter++;
  } else {
    clearInterval(interval);
    console.log(
      "Program berhenti karena sudah mengirimkan data sebanyak 2 kali atau tidak ada data yang diterima dari port serial"
    );
    shutdown();
  }
}, 60 * 1000);

const MQTT_OPTIONS = {
  mqttClientId,
  clean: true,
  connectTimeout: 4000,
  username: "emqx",
  password: "public",
  reconnectPeriod: 1000,
};

let mqttConnectUrl = `mqtt://${mqttHost}:${mqttPort}`;

const client = mqtt.connect(mqttConnectUrl, MQTT_OPTIONS);
const topic = "EWS.Settings." + SerialNode;
const demoTopic = "EWS.Demo." + SerialNode;

// fungsi untuk mengirim data ke API
function sendToAPI(data) {
  // kirim data ke API HTTP Method
  // fetch(`${BACKEND_URL}/telemetry`, {
  //   method: "POST",
  //   body: JSON.stringify(data),
  //   headers: {
  //     Accept: "application/json",
  //     "Content-Type": "application/json",
  //   },
  // })
  //   .then((res) => res.json())
  //   .then((response) => {
  //     console.log("Berhasil mengirimkan data ke API:", response);
  //   })
  //   .catch((error) => {
  //     console.log("Gagal mengirimkan data ke API:", error);
  //   });

  // kirim data ke MQTT
  data.version = 2
  client.publish("EWS.telemetry", JSON.stringify(data), { qos: 1 }, console.log);
}

function captureAndSendToApi(cb, requestBody) {
  Webcam.capture("./telemetry.jpg", function (err, data) {
    if (err) {
      console.error("Error camera:", err);
    }
    requestBody.camera = data;
    cb(requestBody);
  });
}

// event saat terhubung dengan broker MQTT
client.on("connect", async () => {
  console.log("Terhubung dengan broker MQTT");

  port.write('0,0,1,*')

  client.subscribe([topic, demoTopic], () => {
    console.log("MQTT: Subscribe ke topic: " + topic);
    console.log("MQTT: Subscribe ke topic: " + demoTopic);
    
    client.publish(
      "request-setting",
      JSON.stringify({ serial_number: SerialNode, type: 'NODE' })
    );
  });

});

let curahHujan = 0;
let waterLevel = 0;

// event saat menerima pesan dari broker MQTT
client.on("message", (topic, message) => {
  console.log("Pesan dari broker MQTT:", message.toString());

  if (topic === demoTopic) {
    const result = JSON.parse(message.toString())

    waterLevel = calculateTma(parseFloat(result.water_level))

    port.write("REQ,*");
  }

  // parsing pesan menjadi objek JavaScript
  const settings = JSON.parse(message.toString());

  // simpan pengaturan pada variabel global
  globalSettings = settings;

  console.log("Global setting sekarang:", globalSettings);

  // clear interval saat menerima pesan setting baru
  clearInterval(interval);

  // buat interval baru dengan waktu dan durasi yang disesuaikan
  const timer = settings.time_based_time * 60000;
  const maxCount = REPEAT;

  counter = 0;
  setInterval(() => {
    if (counter < maxCount) {
      port.write("REQ,*");
      counter++;
    } else {
      clearInterval(interval);
      console.log(
        "Program berhenti karena sudah mengirimkan data sebanyak 2 kali atau tidak ada data yang diterima dari port serial"
      );
      shutdown();
    }
  }, timer);
});

function calculateTma(distance) {
  let h0 = parseFloat(globalSettings.h0);
  let h1 = parseFloat(globalSettings.h1);
  let h2 = globalSettings.jarak_maksimal_sensor_tma * 100 - distance;

  return h1 + h0 - h2 <= 0 ? 0 : h1 + h0 - h2;
}

function calculateStatusTma(waterLevel) {
  let siaga1 = globalSettings.siaga1;
  let siaga2 = globalSettings.siaga2;
  let siaga3 = globalSettings.siaga3;

  if (waterLevel < siaga3) {
    return 4;
  }

  if (waterLevel >= siaga3 && waterLevel < siaga2) {
    return 3;
  }

  if (waterLevel >= siaga2 && waterLevel < siaga1) {
    return 2;
  }

  if (waterLevel > siaga1) {
    return 1;
  }
}

function calculateRainGauge(rainBucket) {
  // Baca data dari sensor rain bucket
  let sensorData = rainBucket;

  // Hitung jumlah air yang terkumpul dalam wadah sensor
  let jumlahAir = sensorData * 0.2;

  // Tambahkan jumlah air ke dalam variabel curah hujan
  curahHujan += jumlahAir;

  // Tampilkan hasil pengukuran
  return curahHujan;
}

function calculateAltitude(temperature, pressure) {
  const P0 = 101325; // tekanan standar pada permukaan laut, dalam satuan Pa
  const T0 = 288.15; // suhu standar pada permukaan laut, dalam satuan K
  const L = 0.0065; // laju perubahan suhu dengan ketinggian, dalam satuan K/m
  const g = 9.80665; // percepatan gravitasi, dalam satuan m/s^2
  const M = 0.0289644; // massa molar udara, dalam satuan kg/mol
  const R = 8.31432; // konstanta gas ideal, dalam satuan J/(mol*K)

  const temperatureK = temperature + 273.15; // konversi suhu dari Celsius ke Kelvin
  const pressurePa = pressure * 100; // konversi tekanan dari hektopascal (hPa) ke pascal (Pa)

  const pressureRatio = pressurePa / P0;
  const temperatureRatio = T0 / temperatureK;
  const exponent = (g * M) / (R * L);
  const altitudeMeters =
    ((T0 - L * 0) / L) * (1 - Math.pow(pressureRatio, exponent));

  return altitudeMeters;
}

// event saat port serial terbuka
port.on("open", () => {
  console.log("Port serial terbuka");
});

// event saat menerima data dari port serial
parser.on("data", (data) => {
  console.log("Data dari port serial:", data);

  if (data.split(",").length < 13) return;

  // parsing data menjadi objek JavaScript
  const [
    temperature,
    humidity,
    pressure,
    windDirection,
    windSpeed,
    distance,
    rainBucket,
    lux,
    current,
    voltage,
    statusSiaga,
    statusAlarm,
  ] = data.split(",");

  console.log("Status siaga: " + statusSiaga);
  console.log("Status Alarm: " + statusAlarm);

  if (waterLevel === 0) {
    waterLevel = calculateTma(parseFloat(distance));
  }

  let floatTemperature = parseFloat(temperature) / 10;
  let floatPressure = parseFloat(pressure) / 10;

  parsedData = {
    serial_number: SerialNode,
    tma_level: calculateStatusTma(waterLevel),
    temperature: floatTemperature,
    humidity: parseFloat(humidity) / 10,
    atmospheric_pressure: floatPressure,
    wind_direction: parseFloat(windDirection),
    wind_speed: parseFloat(windSpeed),
    rain_gauge: calculateRainGauge(parseFloat(rainBucket)),
    water_level: waterLevel,
    lat: globalSettings.lat,
    lng: globalSettings.lng,
    alt: calculateAltitude(floatTemperature, floatPressure),
    result_camera: null,
    current_condition: parseFloat(lux),
    voltage: parseFloat(voltage),
    batery_consumption: 50,
    arus: parseFloat(current) / 1000,
    debit_air: 0,
  };

  let siaga = parsedData.tma_level;
  let alarm = parsedData.tma_level === 1;

  if (TMA_MODE == "REVERSE") {
    siaga =
      parsedData.tma_level === 2
        ? 2
        : parsedData.tma_level === 3
        ? 1
        : parsedData.tma_level === 1
        ? 3
        : 0;

    alarm = siaga === 1;
  }

  if (parsedData.tma_level !== currentStatus) {
    captureAndSendToApi(sendToAPI, parsedData);
    currentStatus = parsedData.tma_level;
  } else {
    sendToAPI(parsedData)
  }

  console.log("Data terkirim:", parsedData);

  port.write(`${siaga},${alarm},1,*`);
});
