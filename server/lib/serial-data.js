module.exports = {
  Data: (function (){
    var rawData = ""
    var allowed = [
      "suhu", "kelembapan", "tekanan", "arah_angin", "solar", "no2", "o3", "co", "so2"
    ]

    var setData = function (data) {
      rawData = data
    }

    var getRawData = function () {
      return rawData
    }

    var parseData = function (allowed = []) {
      data = rawData.split(",")

      result = {}

      allowed.forEach((key, i) => result[key] = data[i])

      return result
    }

    return  {
      setData: function(data) {
        setData(data)
      },
      getRawData: function() {
        return getRawData()
      },
      parseData: function(allowed = []) {
        return parseData(allowed)
      }
    }
  })()
}
