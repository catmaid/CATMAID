;(function() {

  if(typeof Blob === 'undefined')
    return console.warn('Screw-FileReader is only meant to work in those' +
  'engine who already has some basic support for blob')

  var blob = Blob.prototype
  var fullStreamSupport = false
  var basicStreamSupport = false
  var fetchTransform = false
  var URL = window.URL || window.webkitURL

  function promisify(obj) {
    return new Promise(function(resolve, reject) {
      obj.onload =
      obj.onerror = function(evt) {
        obj.onload =
        obj.onerror = null

        evt.type === 'load'
          ? resolve(obj.result || obj)
          : reject(new Error('Failed to read the blob/file'))
      }
    })
  }

  function toImage(url) {
    var img = new Image
    img.src = url
    return promisify(img)
  }

  function getRotation(buffer) {
    var view = new DataView(buffer)

    if (view.getUint16(0, false) != 0xFFD8) return -2

    var length = view.byteLength
    var offset = 2

    while (offset < length) {
      var marker = view.getUint16(offset, false)
      offset += 2

      if (marker == 0xFFE1) {
        if (view.getUint32(offset += 2, false) != 0x45786966) {
          return -1
        }
        var little = view.getUint16(offset += 6, false) == 0x4949
        offset += view.getUint32(offset + 4, little)
        var tags = view.getUint16(offset, little)
        offset += 2

        for (var i = 0; i < tags; i++)
          if (view.getUint16(offset + (i * 12), little) == 0x0112)

        return view.getUint16(offset + (i * 12) + 8, little);
      }
      else if ((marker & 0xFF00) != 0xFF00) break
      else offset += view.getUint16(offset, false)
    }

    return -1
  }

  function rotate(img, angle) {
    var width = img.width
    var height = img.height
    var canvas = document.createElement('canvas')
    var ctx = canvas.getContext('2d')

    // revoke memory
    URL.revokeObjectURL(img.src)

    // set proper canvas dimensions before transform & export
    if (angle > 4 && angle < 9) {
      canvas.width = height
      canvas.height = width
    } else {
      canvas.width = width
      canvas.height = height
    }

    // transform context before drawing image
    switch (angle) {
        case 2: ctx.transform(-1, 0, 0, 1, width, 0); break
        case 3: ctx.transform(-1, 0, 0, -1, width, height ); break
        case 4: ctx.transform(1, 0, 0, -1, 0, height ); break
        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break
        case 6: ctx.transform(0, 1, -1, 0, height , 0); break
        case 7: ctx.transform(0, -1, -1, 0, height , width); break
        case 8: ctx.transform(0, -1, 1, 0, 0, width); break
    }

    // draw image
    ctx.drawImage(img, 0, 0)

    // export blob
    return new Promise(function (resolve) {
      canvas.toBlob(resolve)
    })
  }

  function fixRotation(blob) {
    // read only the headers
    return blob.slice(0, 65536)
    .arrayBuffer()
    .then(getRotation)
    .then(function (angle) {
      // get a image object
      return Promise.resolve(blob.url() || blob.dataURL())
      .then(toImage)
      .then(function(img) {
        // return img unless it needs rotation
        return angle < 2 ? img :
          // rotate the image
          rotate(img, angle).then(function (blob) {
            return blob.url() || blob.dataURL()
          }).then(toImage)
      })
    })
  }

  try {
    new ReadableStream({})
    basicStreamSupport = true
  } catch (e) {}

  try {
    new ReadableStream({type: 'bytes'})
    fullStreamSupport = true
  } catch (e) {}

  try {
    (new Response(new Blob)).getReader()
    fetchTransform = true
  } catch (e) {}

  if (!blob.arrayBuffer) {
    blob.arrayBuffer = function arrayBuffer() {
      var fr = new FileReader
      fr.readAsArrayBuffer(this)
      return promisify(fr)
    }
  }

  if (!blob.text) {
    blob.text = function text() {
      var fr = new FileReader
      fr.readAsText(this)
      return promisify(fr)
    }
  }

  if (!blob.dataURL) {
    blob.dataURL = function dataURL() {
      var fr = new FileReader
      fr.readAsDataURL(this)
      return promisify(fr)
    }
  }

  if (!blob.url) {
    blob.url = function url() {
      return URL ? URL.createObjectURL(this) : null
    }
  }

  if (!blob.json) {
    blob.json = function json() {
      return this.text().then(JSON.parse)
    }
  }

  if (!blob.image) {
    blob.image = function image(preventRevoke) {
      return fixRotation(this)
      .then(function(img) {
        !preventRevoke && URL.revokeObjectURL(img.src)
        return img
      })
    }
  }

  if (!blob.stream) {
    blob.stream =

    fullStreamSupport ? function stream() {
      var position = 0
      var blob = this

      return new ReadableStream({
        type: 'bytes',
        autoAllocateChunkSize: 524288,

        pull: function (controller) {
          var v = controller.byobRequest.view
          var chunk = blob.slice(position, position + v.byteLength)
          return chunk.arrayBuffer()
          .then(function (buffer) {
            var uint8array = new Uint8Array(buffer)
            var bytesRead = uint8array.byteLength

            position += bytesRead
            v.set(uint8array)
              controller.byobRequest.respond(bytesRead)

            if(position >= blob.size)
              controller.close()
          })
        }
      })
    }:

    // basic stream support
    basicStreamSupport ? function stream(blob){
      var position = 0
      var blob = this

      return new ReadableStream({
        pull: function (controller) {
          var chunk = blob.slice(position, position + 524288)

          return chunk.arrayBuffer().then(function (buffer) {
            position += buffer.byteLength
            var uint8array = new Uint8Array(buffer)
            controller.enqueue(uint8array)

            if(position == blob.size)
              controller.close()
          })
        }
      })
    }:

    // fetchTransform
    fetchTransform ? function stream() {
      return (new Response(this)).body
    }:

    function stream() {
      throw new Error('Include https://github.com/creatorrr/web-streams-polyfill')
    }
  }

}());
