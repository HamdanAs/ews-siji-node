module.exports = {
  routes: (function (){
    const SerialportController = require('../controller/SerialportController')

    return  {
      init: function (app = express()) {
        app.post("/write", SerialportController.write);
        
        app.get('/port-list', SerialportController.list)
        
        app.get('/selected-port', SerialportController.selectedPort)
        
        app.post('/set-port', SerialportController.setPort)
      }
    }
  })()
}
