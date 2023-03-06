const serialport = require("serialport");
const { Data } = require('./serial-data')
const { ReadlineParser } = require("@serialport/parser-readline");

const SerialPort = serialport.SerialPort;

