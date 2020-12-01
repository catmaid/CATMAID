(function(CATMAID) {

  "use strict";

  /**
   * A widget showing both a personal and shared note editing space.
   */
  let NotesWidget = function() {
    InstanceRegistry.call(this);
    this.widgetID = this.registerInstance();
    this.contentContainer = null;
    this.personalNotes = null;
    this.sharedNotes = null;
  };

  NotesWidget.prototype = Object.create(InstanceRegistry.prototype);
  NotesWidget.prototype.constructor = NotesWidget;

  NotesWidget.prototype.getName = function() {
    return `Notes ${ this.widgetID}`;
  };

  NotesWidget.prototype.getWidgetConfiguration = function() {
    var widget = this;
    return {
      class: "notes-widget",
      createControls: function(buttons) {
        CATMAID.DOM.appendElement(buttons, {
            type: 'button',
            label: 'Refresh',
            onclick: function() {
              widget.update();
            }
        });
        CATMAID.DOM.appendElement(buttons, {
            type: 'button',
            label: 'Save',
            onclick: function() {
              widget.save();
            }
        });
      },
      createContent: function(content) {
        this.contentContainer = content;

        let personalNotesContainer = content.appendChild(document.createElement('p'));
        let personalNotesContainerHeader = personalNotesContainer.appendChild(document.createElement('h3'));
        personalNotesContainerHeader.appendChild(document.createTextNode('Personal notes in this project'));
        this.personalNotes = personalNotesContainer.appendChild(document.createElement('textarea'));
        this.personalNotes.value = NotesWidget.Settings.session.notes;
        if (!CATMAID.session.is_authenticated) {
          this.personalNotes.readOnly = true;
        }

        let personalCrossPNotesContainer = content.appendChild(document.createElement('p'));
        let personalCrossPNotesContainerHeader = personalCrossPNotesContainer.appendChild(document.createElement('h3'));
        personalCrossPNotesContainerHeader.appendChild(document.createTextNode('Personal notes across projects'));
        this.personalCrossPNotes = personalCrossPNotesContainer.appendChild(document.createElement('textarea'));
        this.personalCrossPNotes.value = NotesWidget.Settings.user.notes;
        if (!CATMAID.session.is_authenticated) {
          this.personalCrossPNotes.readOnly = true;
        }

        let globalNotesContainer = content.appendChild(document.createElement('p'));
        let globalNotesContainerHeader = globalNotesContainer.appendChild(document.createElement('h3'));
        globalNotesContainerHeader.appendChild(document.createTextNode('Global notes'));
        this.globalNotes = globalNotesContainer.appendChild(document.createElement('textarea'));
        this.globalNotes.value = NotesWidget.Settings.global.notes;
        if (!CATMAID.hasPermission(project.id, 'can_administer') || !CATMAID.session.is_authenticated) {
          this.globalNotes.readOnly = true;
        }
      },
      helpText: [
        '<p>The Notes widget allows users to store personal and shared messages on the server.</p>'
      ].join('\n')
    };
  };

  /**
   * Make sure we got the latest settings.
   */
  NotesWidget.prototype.update = function() {
    CATMAID.NotesWidget.Settings.load().then(() => CATMAID.msg("Success", "Notes updates"));
  };

  /**
   * Save the notes.
   */
  NotesWidget.prototype.save = function() {
    if (this.personalNotes) {
      CATMAID.NotesWidget.Settings.set('notes', this.personalNotes.value, 'session');
      CATMAID.NotesWidget.Settings.set('notes', this.personalCrossPNotes.value, 'user');
      if (CATMAID.hasPermission(project.id, 'can_administer')) {
        CATMAID.NotesWidget.Settings.set('notes', this.globalNotes.value, 'global');
      }
    }
  };

  NotesWidget.Settings = new CATMAID.Settings(
    'notes',
    {
      version: 0,
      entries: {
        notes: {
          default: ''
        },
        shared_notes: {
          default: ''
        }
      }
    });

  CATMAID.NotesWidget = NotesWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: 'Notes',
    description: 'Take both personal and shared notes',
    key: 'notes-widget',
    creator: NotesWidget
  });

})(CATMAID);
