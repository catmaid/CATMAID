(function(ATMAID) {

  "strict";
  let RenameNeuronsDialog = function(skeletonIds) {
    CATMAID.OptionsDialog.call(this, `Rename ${skeletonIds.length} neurons`);

    this.dialog.classList.add('config-dialog');
    this.appendMessage('Below you find all previously selected neurons along with their names. You can define a search text string below that will be replaced with the replacement field value. If the search string starts with a "/" character, the find pattern will be treated as regular expression. Names will only be changed if OK is pressed.');
    this.appendMessage('For instance, to use regex capture groups to match all names of the pattern "neuron <number>" and reverse both components, "/neuron (.*)" could be used as search pattern, and "$1 neuron.');

    // Add input fields
    let fieldContainer = document.createElement('span');
    fieldContainer.classList.add('cols3');
    this.dialog.appendChild(fieldContainer);
    let findField = fieldContainer.appendChild(CATMAID.DOM.createInput('text',
        undefined, 'Find', 'Specify a pattern to find in the present base name',
        '', undefined, undefined, 10, '/ for RegEx'));
    let replaceField = fieldContainer.appendChild(CATMAID.DOM.createInput('text',
        undefined, 'Replace', 'Specify a pattern to replace the "Find" pattern with',
        '', undefined, undefined, 10));

    // Keeps track of the initially laoded original names.
    let names;
    // This will keep track of the new names.
    let newNameIndex = new Map();

    let lastFindValue, lastReplaceValue;

    let updateNames = () => {
      let find = findField.querySelector('input').value;
      let replace = replaceField.querySelector('input').value;

      if (find === lastFindValue && replace ===lastReplaceValue) {
        return;
      }
      lastFindValue = find;
      lastReplaceValue = replace;

      findField.querySelector('input').classList.remove('error');
      if (find.length === 0) {
        newNameIndex.clear();
        datatable.rows().invalidate();
        datatable.draw();
        return;
      }

      let inRegExMode = find[0] === '/';

      let findRegex;
      if (inRegExMode) {
        try {
          findRegex = new RegExp(find.substr(1));
        } catch (error) {
          findField.querySelector('input').classList.add('error');
          return;
        }
      }

      datatable.rows().data().each(d => {
        let name;
        if (inRegExMode) {
          name = d.presentName.replace(findRegex, replace);
        } else {
          name = d.presentName;
          let lastIndex = null;
          let offset = 0;
          while (true) {
            lastIndex = name.indexOf(find, offset);
            if (lastIndex > -1) {
              name = name.replace(find, replace);
              offset = lastIndex + replace.length;
            } else {
              break;
            }
          }
        }
        if (name === d.presentName) {
          newNameIndex.delete(d.skeletonId);
        } else {
          newNameIndex.set(d.skeletonId, name);
        }
      });

      datatable.rows().invalidate();
      datatable.draw();
    };
    fieldContainer.addEventListener('keyup', updateNames);

    // Add name table
    var skeletonListContainer = document.createElement('div');
    this.skeletonNameTable = skeletonListContainer.appendChild(document.createElement('table'));
    this.dialog.appendChild(skeletonListContainer);

    var self = this;
    var datatable = $(this.skeletonNameTable).DataTable({
      dom: 't<ip>',
      autoWidth: false,
      order: [],
      data: this.data,
      language: {
        info: "Showing _START_ to _END_  of _TOTAL_ skeletons",
        infoFiltered: "(filtered from _MAX_ total skeletons)",
        emptyTable: 'No skeleton found',
        zeroRecords: 'No matching skeletons found'
      },
      ajax: (data, callback, settings) => {
        let nns = CATMAID.NeuronNameService.getInstance();
        // Make sure we have most recent names
        let getNames = names ? Promise.resolve(names) :
            CATMAID.Skeletons.getNames(project.id, skeletonIds);
        getNames.then(names => {
            let rows = skeletonIds.map(skeletonId => {
              let displayName = nns.getName(skeletonId);
              let baseName = names[skeletonId];
              return {
                skeletonId: skeletonId,
                displayName: displayName,
                presentName: baseName,
              };
            });

            callback({
              draw: data.draw,
              recordsTotal: rows.length,
              recordsFiltered: rows.length,
              data: rows,
            });
          })
          .catch(CATMAID.handleError);
      },
      columns: [{
        data: 'skeletonId',
        title: 'Skeleton ID'
      }, {
        data: 'displayName',
        title: 'Display name'
      }, {
        data: 'presentName',
        title: 'Present base name'
      }, {
        data: 'newName',
        title: 'New base name',
        render: (data, type, row, meta) => {
          return newNameIndex.has(row.skeletonId) ?
              `<span class='highlight-change'>${newNameIndex.get(row.skeletonId)}</span>` :
              `<span class='highlight-default'>${row.presentName}</span>`;
        },
      }]
    });

    this.onOK = function() {
      let querySkeletonIds = Array.from(newNameIndex.keys());
      CATMAID.Neurons.idsFromSkeletons(project.id, querySkeletonIds)
        .then(neuronIds => {
          let neuronList = querySkeletonIds.filter(skid => !!neuronIds[skid]).map(skeletonId => {
            return [neuronIds[skeletonId], newNameIndex.get(skeletonId)];
          });
          return CATMAID.Neurons.renameAll(project.id, neuronList);
        })
        .then(r => {
          CATMAID.msg('Success', `Renamed ${newNameIndex.size} neurons`);
        })
        .catch(CATMAID.handleError);
    };
  };

  RenameNeuronsDialog.prototype = Object.create(CATMAID.OptionsDialog.prototype);
  RenameNeuronsDialog.prototype.constructor = RenameNeuronsDialog;

  RenameNeuronsDialog.prototype.show = function(w=660, h='auto') {
    CATMAID.OptionsDialog.prototype.show.call(this, w, h, true, undefined, true);
  };


  CATMAID.RenameNeuronsDialog = RenameNeuronsDialog;

})(CATMAID);
