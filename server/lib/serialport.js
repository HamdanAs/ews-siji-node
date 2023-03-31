const serialport = require("serialport");
const { Data } = require("./serial-data");
const { ReadlineParser } = require("@serialport/parser-readline");

const SerialPort = serialport.SerialPort;

module.exports = {
  SerialPortSocket: (function () {
    var port;
    var selectedPort = "";

    var getPortList = async function () {
      var ports = await SerialPort.list();

      return ports;
    };

    var getData = function () {
      let allowed = [
        "temp",
        "humidity",
        "pressure",
        "wind_direction",
        "wind_speed",
        "distance",
        "rain_bucket",
        "lux",
        "current",
        "voltage",
        "status",
        "alarm",
      ];

      return new Promise((resolve) => {
        if (Data.getRawData() == "" || Data.getRawData() == undefined) {
          setTimeout(() => {
            resolve(Data.parseData(allowed));
          }, 1000);
        } else {
          resolve(Data.parseData(allowed));
        }
      });
    };

    var setSelectedPort = async function (path) {
      if ((await getPortList().length) < 1) {
        setSelectedPort("");
        return;
      }

      selectedPort = path;
    };

    var getSelectedPort = function () {
      return selectedPort;
    };

    var initPort = function (initPort) {
      if (!initPort) {
        port = new SerialPort({
          path: selectedPort,
          baudRate: 9600,
        });
      } else {
        port = new SerialPort({
          path: initPort,
          baudRate: 9600,
        });
      }

      port.on("error", (err) => {
        console.log("Gagal membuka port");
        console.log(err);
      });

      port.on("open", () => {
        console.log("berhasil menghubungkan port");
      });

      port.on("close", () => {
        setSelectedPort("");
        console.log("berhasil menutup port");
      });
    };

    var initParser = function () {
      console.log("parsing data...");

      parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

      parser.on("data", async (data) => {
        console.log("parsed data: ", data);

        Data.setData(data);
      });
    };

    var write = function (command) {
      if (selectedPort === null || selectedPort === "") return;
      if (command == "" || command == undefined) return;

      port.write(command, function (err) {
        if (err) return console.log("Error on write: ", err);
      });
    };

    return {
      init: function (port = "") {
        if (port != "") {
          initPort(port);
          initParser();

          return;
        }

        if (selectedPort === null || selectedPort === "") {
          return console.log("Error: Silahkan pilih port terlebih dahulu!");
        }

        initPort();
        initParser();
      },
      write: async function (command) {
        write(command);

        return await getData();
      },
      getPortList: async function () {
        return await getPortList();
      },
      setSelectedPort: async function (path) {
        await setSelectedPort(path);
        initPort();
        initParser();
      },
      getSelectedPort: function () {
        return getSelectedPort();
      },
    };
  })(),
};
