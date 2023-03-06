const { SerialPortTutorial } = require("../lib/serialport");

module.exports = (function SerialportController() {
  return {
    write: async (req, res) => {
      await SerialPortTutorial.write(req.body.func).then(result => {
        res.send({data: result});
      })
    },
    list: async (req, res) => {
      res.send(await SerialPortTutorial.getPortList())
    },
    selectedPort: (req, res) => {
      res.send({port: SerialPortTutorial.getSelectedPort()})
    },
    setPort: async (req, res) => {
      await SerialPortTutorial.setSelectedPort(req.body.port)
    
      res.send({port: SerialPortTutorial.getSelectedPort()})
    }
  }
})()
