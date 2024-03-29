(function(CATMAID) {

  "use strict";

  // These patterns can be used in front of commands to optionally specify a
  // type. The regular expressions are designed so that one can also type only a
  // part of the respective prefix.
  CATMAID.CommandParserPrefixes = [
    [/^st(a(c(k)?)?)?[:]?\s*/, 'stack-location'],
    [/^px[:]?\s*/, 'stack-location'],
    [/^ne(u(r(o(n)?)?)?)?[:]?\s*/, 'neuron-id'],
    [/^s(k(e(l(e(t(o(n)?)?)?)?)?)?)?[:]?\s*/, 'skeleton-id'],
    [/^n(o(d(e)?)?)?[:]?\s*/, 'location-id'],
    [/^c(o(n(n(e(c(t(o(r)?)?)?)?)?)?)?)?[:]?\s*/, 'location-id'],
    [/^u(r(l)?)?[:]?\s*/, 'url'],
    [/^b(o(o(k(m(a(r(k)?)?)?)?)?)?)?[:]?\s*/, 'bookmark'],
  ];

  CATMAID.CommandParser = function(name, handle, passive) {
    this.name = name;
    this.handle = handle;
    this.passive = !!passive;
    if (!CATMAID.tools.isFn(handle)) {
      throw new CATMAID.ValueError('Need function has handler');
    }
  };

  CATMAID.RegisteredCommandParsers = [];

  CATMAID.registerCommandParser = function(options) {
    CATMAID.RegisteredCommandParsers.push(new CATMAID.CommandParser(
        options.name, options.handle, options.passive));
  };

  // A command parser that can read simple X, Y, Z and X, Y coordinates. It also
  // accepts spaces and tabs as delimiter.
  CATMAID.registerCommandParser({
    name: 'location',
    handle: (command) => {
      // Remove all brackets and parentheses and removeall spapces arround
      // commas and at the beginning and the end. Replace all remaining spaces
      // with commas for easier splitting.
      let cleaned = command.replace(/[\[\]\|\(\){}]/g, '')
          .replace(/\s*,\s*/g, ',').replace(/^\s\+/, '')
          .replace(/\s\+$/, '').replace(/\s/g, ',');
      let parts = cleaned.split(',').map(c => c.trim());
      if (parts.length > 2) {
        let coords = parts.map(Number);
        if (coords.every(c => !Number.isNaN(c))) {
          project.moveTo(coords[2], coords[1], coords[0], coords[3]);
          return true;
        }
      } else if (parts.length === 2) {
        let coords = parts.map(Number);
        if (coords.every(c => !Number.isNaN(c))) {
          project.moveTo(project.coordinates.z, c[1], c[0]);
          return true;
        }
      }
      return false;
    }
  });

  // A command parser that can read simple X, Y, Z and X, Y coordinates in stack
  // space of the focused stack viewer.
  CATMAID.registerCommandParser({
    name: 'stack-location',
    passive: true,
    handle: (command) => {
      if (!project.focusedStackViewer) {
        return;
      }
      let ps = project.focusedStackViewer.primaryStack;
      // Remove all brackets and parentheses.
      let cleaned = command.replace(/[\[\]\|\(\){}]/g, '');
      let parts = cleaned.split(',').map(c => c.trim());
      if (parts.length > 2) {
        let coords = parts.map(Number);
        if (coords.every(c => !Number.isNaN(c))) {
          let xp = ps.stackToProjectX(coords[2], coords[1], coords[0]);
          let yp = ps.stackToProjectY(coords[2], coords[1], coords[0]);
          let zp = ps.stackToProjectZ(coords[2], coords[1], coords[0]);
          project.moveTo(zp, yp, xp);
          return true;
        }
      } else if (parts.length === 2) {
        let coords = parts.map(Number);
        if (coords.every(c => !Number.isNaN(c))) {
          let xp = ps.stackToProjectX(coords[2], coords[1], coords[0]);
          let yp = ps.stackToProjectY(coords[2], coords[1], coords[0]);
          project.moveTo(project.coordinates.z, yp, xp);
          return true;
        }
      }
      return false;
    }
  });

  // Try to find the root node of a skeleton with the user input as ID.
  CATMAID.registerCommandParser({
    name: 'skeleton-id',
    handle: (command) => {
      let value = Number(command);
      if (!Number.isNaN(value)) {
        // Ask back-end for location coordinates
        return CATMAID.Skeletons.getRootNode(project.id, value)
          .then(result => {
            return project.moveTo(result.z, result.y, result.z)
              .then(() => result);
          })
          .then(result => {
             SkeletonAnnotations.staticSelectNode(result.root_id);
             CATMAID.msg("Success", `Selected root node of skeleton ${value}`);
             return true;
          })
          .catch(() => false);
      }
      return false;
    }
  });

  // Try to get a location model instance (e.g. treenodes, connectors) with the
  // user input as ID.
  CATMAID.registerCommandParser({
    name: 'location-id',
    handle: (command) => {
      let value = Number(command);
      if (!Number.isNaN(value)) {
        // Ask back-end for location coordinates
        return CATMAID.Nodes.getLocation(value)
          .then(result => {
            project.moveTo(result[3], result[2], result[1]);
            return result;
          })
          .then(result => {
            SkeletonAnnotations.staticSelectNode(result[0]);
            CATMAID.msg("Success", `Loaded location object ${result[0]}`);
            return true;
          })
          .catch(()=> false);
      }
      return false;
    }
  });

  // Try to find the root node of a skeleton with the user input as ID.
  CATMAID.registerCommandParser({
    name: 'neuron-id',
    handle: (command) => {
      let value = Number(command);
      if (!Number.isNaN(value)) {
        // Ask back-end for skeleton IDs of neuron
        return CATMAID.Neurons.getSkeletons(project.id, value)
          .then(result => {
            let skeletonId = result[0];
            return CATMAID.Skeletons.getRootNode(project.id, skeletonId);
          })
          .then(result => {
            project.moveTo(result.z, result.y, result.z)
              .then(() => SkeletonAnnotations.staticSelectNode(result.root_id));
            CATMAID.msg("Success", `Selected root node of skeleton ${value}`);
            return true;
          })
          .catch(() => false);
      }
      return false;
    }
  });

  // Try to find a bookmark with the command text as name.
  CATMAID.registerCommandParser({
    name: 'bookmark',
    handle: command => {
      // The bookmark system only allows single letter bookmarks, becasue it
      // stores the keycode rather than the characters.
      if (command.length !== 1) {
        return false;
      }
      let keyCode = command.charCodeAt(0);
      if (CATMAID.Bookmarks.has(keyCode, CATMAID.Bookmarks.MODES.SKELETON)) {
        return CATMAID.Bookmarks.goTo(keyCode, CATMAID.Bookmarks.MODES.SKELETON);
      }
      if (CATMAID.Bookmarks.has(keyCode, CATMAID.Bookmarks.MODES.NODE)) {
        return CATMAID.Bookmarks.goTo(keyCode, CATMAID.Bookmarks.MODES.NODE);
      }
      if (CATMAID.Bookmarks.has(keyCode, CATMAID.Bookmarks.MODES.MARK)) {
        return CATMAID.Bookmarks.goTo(keyCode, CATMAID.Bookmarks.MODES.MARK);
      }
      return false;
    }
  });

  // Try to parse URL coordinate components from the passed in command.
  CATMAID.registerCommandParser({
    name: 'url',
    handle: (command) => {
      var urlParams = CATMAID.tools.parseQuery(command);
      if (urlParams && urlParams['xp'] !== undefined &&
          urlParams['yp'] !== undefined && urlParams['zp'] !== undefined) {
        let [xp, yp, zp] = [Number(urlParams['xp']), Number(urlParams['yp']), Number(urlParams['zp'])];
        if (Number.isNaN(xp) || Number.isNaN(yp) || Number.isNaN(zp)) {
          return false;
        }
        CATMAID.msg("URL location", "Moving view to project location from URL");
        return SkeletonAnnotations.staticMoveTo(zp, yp, xp);
      }
      return false;
    }
  });


  CATMAID.handleTextCommand = function(command, i = 0, forcePrefixCheck = false) {
    if (CATMAID.RegisteredCommandParsers.length === 0) {
      return Promise.reject(new CATMAID.Warning("No command parsers found"));
    }
    if ((CATMAID.RegisteredCommandParsers.length - 1) < i ) {
      return Promise.reject(new CATMAID.Warning("Passed in parser index larger than available parsers"));
    }
    if (CATMAID.RegisteredCommandParsers[i].passive) {
      if (CATMAID.RegisteredCommandParsers.length > (i + 1)) {
        return CATMAID.handleTextCommand(command, i+1, true);
      }
      return false;
    }

    if (i === 0 || forcePrefixCheck) {
      // In the first call, try to find a matching prefix and jump to a parser
      // directly.
      for (let pattern of CATMAID.CommandParserPrefixes) {
        if (pattern[0].test(command)) {
          let type = pattern[1];
          let value = command.replace(pattern[0], '');

          // Find parser
          for (let parser of CATMAID.RegisteredCommandParsers) {
            if (parser.name === type) {
              return parser.handle(value);
            }
          }
          return false;
        }
      }
    }

    let handle = Promise.resolve().then(() => {
        return CATMAID.RegisteredCommandParsers[i].handle(command);
      });

    return handle
      .then(handled => {
        if (handled) {
          return true;
        }
        if (CATMAID.RegisteredCommandParsers.length > (i + 1)) {
          return CATMAID.handleTextCommand(command, i+1);
        }
        return false;
      });
  };

})(CATMAID);
