(function(CATMAID) {

  "use strict";

  class FileExporter {
    constructor(data, fileName, mimeType) {
      this.data = data;
      this.fileName = fileName;
      this.mimeType = mimeType;
    }
  }

  FileExporter.export = function(data, fileName, mimeType, stream='auto',
      encoderType=TextEncoder) {
    if (stream === true || (stream === 'auto' && CATMAID.Client.Settings.session.use_file_export_streams)) {
      return new StreamFileExporter(data, fileName, mimeType, encoderType);
    } else {
      return new BlobFileExporter(data, fileName, mimeType);
    }
  };

  FileExporter.saveAs = function(data, fileName, mimeType, stream='auto',
      encoderType=TextEncoder) {
    CATMAID.FileExporter.export(data, fileName, mimeType, stream, encoderType).save();
  };


  class BlobFileExporter extends FileExporter {
    constructor(...args) {
      super(...args);

      // Make sure we store data as array if it isn't already a Blob.
      if (!(this.data instanceof Blob) && !(this.data instanceof Array)) {
        if (this.data) {
          this.data = [this.data];
        } else {
          this.data = [];
        }
      }
    }

    /**
     * Add data to the exporter.
     */
    write(data) {
      if (this.data instanceof Blob) {
        throw new CATMAID.ValueError("The existing Blob instance can't be extended");
      }
      this.data.push(data);
    }

    save() {
      let blob;
      if (this.data instanceof Blob) {
        blob = this.data;
      } else {
        blob = new Blob(this.data instanceof Array ? this.data : [this.data],
            {type: this.mimeType});
      }
      saveAs(blob, this.fileName);
    }
  }


  class StreamFileExporter extends FileExporter {
    constructor(data, fileName, mimeType, encoderType=TextEncoder) {
      super(data, fileName, mimeType);

      this.fileStream = streamSaver.createWriteStream(fileName);

      // Write initial data
      if (this.data && this.data instanceof Blob) {
        this.data.stream().pipeTo(this.fileStream);
      } else {
        this.writer = this.fileStream.getWriter();
        this.encoder = encoderType ? new encoderType() : null;

        if (this.data) {
          this.write(this.data);
        }
      }
    }

    write(data) {
      if (this.writer) {
        this.writer.write(this.encoder ?
            this.encoder.encode(data) : data);
      } else {
        throw new CATMAID.ValueError("No writer enabled for exporter, can't append");
      }
    }

    save() {
      if (this.writer) {
        this.writer.close();
        CATMAID.msg('Streaming exporter', 'Should no file download start, make sure to enabled "Ask where to save each" download.');
      } else if (!(this.data instanceof Blob)) {
        throw new CATMAID.ValueError("No writer enabled for exporter, can't close");
      }
    }
  }


  // Export constructor
  CATMAID.FileExporter = FileExporter;
  CATMAID.BlobFileExporter = BlobFileExporter;
  CATMAID.StreamFileExporter = StreamFileExporter;

})(CATMAID);
