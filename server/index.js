const { SerialPortTutorial, SerialPortSocket } = require("./lib/serialport");
const { routes } = require('./routes/api')
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const app = express()
const http = require('http')
const server = http.createServer(app)
const { Server } = require('socket.io')
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  }
})

app.use(helmet());
app.use(bodyParser.json());
app.use(cors());
app.use(morgan("combined"));

app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");

SerialPortTutorial.init();

io.on('connection', socket => {
  console.log("a user connected");

  SerialPortSocket.init(socket);

  socket.on('get port list', async () => {
    socket.emit('get port list', await SerialPortTutorial.getPortList())
  })

  socket.on('get selected port', () => {
    socket.emit('get selected port', SerialPortTutorial.getSelectedPort())
  })

  socket.on('port connected', () => {
    
  })

  socket.on('port open', () => {
    
  })

  socket.on('disconnect', () => {
    console.log("a user disconnected");
  })
})

routes.init(app)

server.listen(8081, (error) => {
  if (error) throw error;

  console.log("Server created");
});
