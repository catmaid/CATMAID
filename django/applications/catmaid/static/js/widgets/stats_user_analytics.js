/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  project
*/

(function(CATMAID) {

  "use strict";

  var UserAnalytics = function(options) {
    options = options || {};
    this.userId = options.userId || CATMAID.session.userid;
    this.startDate = options.startDate || "-10";
    this.endDate = options.endDate || "0";
    this.initialUpdate = undefined === options.initialUpdate ?
        true : options.initialUpdate;
  };

  UserAnalytics.prototype.getName = function() {
    return "User Analytics";
  };

  UserAnalytics.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "user-analytics-controls",
      createControls: function(controls) {
        var userSelectLabel = document.createElement('label');
        userSelectLabel.appendChild(document.createTextNode('User'));
        var userSelect = document.createElement('select');
        userSelect.setAttribute('data-name', 'user');
        var users = CATMAID.User.all();
        var sortedUserIds = CATMAID.User.sortedIds();
        for (var i=0; i < sortedUserIds.length; ++i) {
          var user = users[sortedUserIds[i]];
          if (!user) {
            throw new CATMAID.ValueError('Couldn\'t find user with ID ' + sortedUserIds[i]);
          }
          if (user.isAnonymous) {
            continue;
          }
          var name = user.fullName ? user.fullName : user.login;
          var selected = (user.id == this.userId);
          var option = new Option(name, user.id, selected, selected);
          userSelect.add(option);
        }
        userSelectLabel.appendChild(userSelect);

        var startDateLabel = document.createElement('label');
        startDateLabel.appendChild(document.createTextNode('Start date'));
        var startDate = document.createElement('input');
        startDate.setAttribute('type', 'text');
        startDate.setAttribute('data-name', 'start_date');
        startDateLabel.appendChild(startDate);

        var endDateLabel = document.createElement('label');
        endDateLabel.appendChild(document.createTextNode('End date'));
        var endDate = document.createElement('input');
        endDate.setAttribute('type', 'text');
        endDate.setAttribute('data-name', 'end_date');
        endDateLabel.appendChild(endDate);

        var maxInactivityLabel = document.createElement('label');
        maxInactivityLabel.appendChild(document.createTextNode('Max inactivity (min) '));
        var maxInactivity = document.createElement('input');
        maxInactivity.setAttribute('type', 'number');
        maxInactivity.setAttribute('size', '1');
        maxInactivity.setAttribute('min', '0');
        maxInactivity.value = 3;
        maxInactivity.style.width = '4em';
        maxInactivity.setAttribute('data-name', 'max_inactivity');
        maxInactivityLabel.appendChild(maxInactivity);

        var allWrites = document.createElement('label');
        var allWritesCb = document.createElement('input');
        allWritesCb.setAttribute('type', 'checkbox');
        allWritesCb.setAttribute('data-name', 'all_writes');
        if (CATMAID.historyTracking) {
          allWritesCb.setAttribute('checked', 'checked');
          allWrites.title = "Include all writing operations in statistics (e.g. annotating, taggin).";
        } else {
          allWritesCb.setAttribute('disabled', 'disabled');
          allWrites.title = "History tracking needs to be enabled for this functionality";
        }
        allWrites.appendChild(allWritesCb);
        allWrites.appendChild(document.createTextNode('All writes'));

        var refresh = document.createElement('input');
        refresh.setAttribute('type', 'button');
        refresh.setAttribute('value', 'Refresh');
        refresh.onclick = this.refresh.bind(this);

        controls.appendChild(userSelectLabel);
        controls.appendChild(startDateLabel);
        controls.appendChild(endDateLabel);
        controls.appendChild(maxInactivityLabel);
        controls.appendChild(allWrites);
        controls.appendChild(refresh);
      },
      contentID: "user-analytics-content",
      createContent: function(content) {
        var img = document.createElement('img');
        img.src = CATMAID.makeURL(project.id + '/useranalytics');
        img.setAttribute('data-name', "useranalyticsimg");
        content.appendChild(img);
      },
      init: function() {

        // Autocompletion for user selection
        $('#user-analytics-controls select[data-name=user]')
            .combobox();

        // Init date fields
        $('#user-analytics-controls input[data-name=start_date]')
          .datepicker({ dateFormat: "yy-mm-dd", defaultDate: -10 })
          .datepicker('setDate', this.startDate);
        $('#user-analytics-controls input[data-name=end_date]')
          .datepicker({ dateFormat: "yy-mm-dd", defaultDate: 0 })
          .datepicker('setDate', this.endDate);

        if (this.initialUpdate) {
          this.refresh();
        }
      }
    };
  };

  /**
   * Refresh the content of this widget based on the current settings.
   */
  UserAnalytics.prototype.refresh = function() {
    $.blockUI();
    try {
      var userSelect = document.querySelector('#user-analytics-controls select[data-name=user]');
      var startInput = document.querySelector('#user-analytics-controls input[data-name=start_date]');
      var endInput = document.querySelector('#user-analytics-controls input[data-name=end_date]');
      var maxInactivityInput = document.querySelector('#user-analytics-controls input[data-name=max_inactivity]');
      var allWritesInput = document.querySelector('#user-analytics-controls input[data-name=all_writes]');
      var start = startInput.value,
          end = endInput.value,
          userId = userSelect.value,
          allWrites = allWritesInput.checked,
          maxInactivity = maxInactivityInput.value,
          project_id = project.id;

      var img = document.querySelector('#user-analytics-content img[data-name=useranalyticsimg]');
      img.src = CATMAID.makeURL(project.id + '/useranalytics' + "?userid=" + userId) +
        "&start=" + start + "&end=" + end + '&all_writes=' + allWrites + '&max_inactivity=' +
        maxInactivity;
    } catch (e) {
      CATMAID.error(e);
      console.log(e, e.stack);
    }
    $.unblockUI();
  };

  UserAnalytics.prototype.setStartDate = function(newDate) {
    this.startDate = newDate;
    $('#user-analytics-controls input[data-name=start_date]')
      .datepicker('setDate', this.startDate);
  };

  UserAnalytics.prototype.setEndDate = function(newDate) {
    this.endDate = newDate;
    $('#user-analytics-controls input[data-name=end_date]')
      .datepicker('setDate', this.endDate);
  };

  UserAnalytics.prototype.setUserId = function(newUserId) {
    this.userId = newUserId;
    $('#user-analytics-controls select[data-name=user]')
        .combobox('set_value', newUserId);
  };

  // Export statistics widget
  CATMAID.UserAnalytics = UserAnalytics;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "User Analytics",
    description: "Fine grained reconstruction time evaluation",
    key: "user-analytics",
    creator: UserAnalytics
  });

})(CATMAID);
