const serialport = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const axios = require("axios");

const SerialPort = serialport.SerialPort;

// Data dari ENV
const mqttHost = process.env.MQTT_HOST;
const mqttPort = process.env.MQTT_PORT;
const mqttClientId = `mqtt_${Math.random().toString(16).slice(3)}`;
const SerialNode = process.env.SERIAL;
const BACKEND_URL = process.env.BACKEND_URL;
const TMA_MODE = process.env.TMA_MODE;

// konfigurasi port serial
const port = new SerialPort("/dev/ttyUSB0", {
  baudRate: 9600,
});

// konfigurasi parser untuk data dari port serial
const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

let globalSettings = {};

const checkConnection = () => {
  require("dns").resolve("www.google.com", function (err) {
    if (err) {
      isOnline = 0;
    } else {
      isOnline = 1;
    }
  });

  port.write(`0,0,${isOnline},*`);
};

checkConnection();

let fetchSetting = async () => {
  let telemetrySetting = await fetch(
    `${BACKEND_URL}/node-setting/${SerialNode}`
  );
  let response = await telemetrySetting.json();
  globalSettings = response;
};

// variabel global untuk menyimpan data dari port serial
let parsedData = null;

// konfigurasi pengiriman data ke API setiap 1 menit sekali dengan batas maksimum pengiriman data sebanyak 2 kali
let counter = 0;
const interval = setInterval(() => {
  if (counter < 2) {
    port.write("REQ,*");
    counter++;
  } else {
    clearInterval(interval);
    console.log(
      "Program berhenti karena sudah mengirimkan data sebanyak 2 kali atau tidak ada data yang diterima dari port serial"
    );
  }
}, 60 * 1000);

// fungsi untuk mengirim data ke API
function sendToAPI(data) {
  // kirim data ke API
  axios
    .post("https://example.com/api/data", data)
    .then((response) => {
      console.log("Berhasil mengirimkan data ke API:", response.data);
    })
    .catch((error) => {
      console.log("Gagal mengirimkan data ke API:", error);
    });
}

const client = mqtt.connect(mqttConnectUrl, MQTT_OPTIONS);
const topic = "EWS.Settings." + SerialNode;

// event saat terhubung dengan broker MQTT
client.on("connect", async () => {
  console.log("Terhubung dengan broker MQTT");

  await fetchSetting().then(() => {
    // subscribe ke topik setting untuk setiap serial port
    client.subscribe(topic, () => {
      console.log("MQTT: Subscribe ke topic: " + topic);
    });
  });
});

// event saat menerima pesan dari broker MQTT
client.on("message", (topic, message) => {
  console.log("Pesan dari broker MQTT:", message.toString());

  // parsing pesan menjadi objek JavaScript
  const settings = JSON.parse(message.toString());

  // simpan pengaturan pada variabel global
  globalSettings = settings;

  // clear interval saat menerima pesan setting baru
  clearInterval(interval);

  // buat interval baru dengan waktu dan durasi yang disesuaikan
  const timer = settings.time_based_time * 60000;
  const maxCount = 2;

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

function calculateRainGauge(rainBucket, prevRainBucket) {
  let rain_gauge_real = 0;

    let RainBucketNow = new Date();
    let globalRain = rainBucket;

    if ((RainBucketNow - prevRainBucket) / 60000 >= 1) {
      rain_gauge_real = globalRain / ((RainBucketNow - RainBucket) / 60000);
      rain_gauge_real = rain_gauge_real <= 0 ? 0 : rain_gauge_real;
      rain_gauge_real = rain_gauge_real >= 8 ? 8 : rain_gauge_real;
    }

    return rain_gauge_real;
}

// event saat port serial terbuka
port.on("open", () => {
  console.log("Port serial terbuka");
});

// event saat menerima data dari port serial
parser.on("data", (data) => {
  console.log("Data dari port serial:", data);

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

  parsedData = {
    temperature: parseFloat(temperature),
    humidity: parseFloat(humidity),
    pressure: parseFloat(pressure),
    windDirection: parseFloat(windDirection),
    windSpeed: parseFloat(windSpeed),
    distance: parseFloat(distance),
    rainBucket: parseFloat(rainBucket),
    lux: parseFloat(lux),
    current: parseFloat(current),
    voltage: parseFloat(voltage),
    statusSiaga: statusSiaga === "1",
    statusAlarm: statusAlarm === "1",
  };

  let waterLevel = calculateTma(parseFloat(distance))

  postData = {
    serial_number: SerialNode,
    tma_level: calculateStatusTma(waterLevel),
    temperature: parseFloat(temperature),
    humidity: parseFloat(humidity),
    atmospheric_pressure: parseFloat(pressure),
    wind_direction: parseFloat(windDirection),
    wind_speed: parseFloat(windSpeed),
    rain_gauge: rain_gauge(),
    water_level: waterLevel,
    lat: globalSettings.lat,
    lng: globalSettings.lng,
    alt: altitude(),
    result_camera: null,
    current_condition: parseFloat(lux),
    voltage: parseFloat(voltage),
    batery_consumption: 50,
    arus: parseFloat(current),
    debit_air: 0,
  };

  // kirim data ke API setelah parsing selesai
  sendToAPI(parsedData);
});
