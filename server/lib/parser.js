module.exports = {
  Parse: function (parser) {
    let parse = function () {};

    parse.parser = parser;

    parse.reset = function reset() {
      this.result = "";
      this.response = [];
      this.done = "";
    };

    parse.reset();

    return parse;
  },
  parser: function (chunk) {
    for (var byte of chunk) {
      this.response.push(byte);
      console.log("response being built ", this.response);
    }
    console.log("current chunck response ", this.response);
    // api version where first byte is 170,
    if (this.response[1]) {
      // second slot is number of bits to follow exlcuding checksum
      if (this.response.length >= 3 + this.response[1]) {
        this.result = String.fromCharCode(this.response)
        
        // 3 = 170 + number of bits bit + checksum
        this.done = true;
      }
    }
  },
};
