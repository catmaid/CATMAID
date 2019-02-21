/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  function User(userID, login, fullName, firstName, lastName, color)
  {
    if (userID !== undefined && login === undefined && fullName === undefined &&
        firstName === undefined && lastName === undefined && color === undefined)
    {
      // Just look up an existing user
      return User.prototype.users[userID];
    }
    else
    {
      // Create a new instance.
      this.id = userID;
      this.login = login;
      this.fullName = fullName;
      this.firstName = firstName;
      this.lastName = lastName;
      this.color = color;
      this.isAanonymous = (login === 'AnonymousUser');

      // Cache the instance for later lookups.
      User.prototype.users[userID] = this;
    }

    return this;
  }

  User.prototype.getDisplayName = function () {
    return this.fullName ? this.fullName : this.login;
  };

  User.displayNameCompare = function (a, b) {
    return a.getDisplayName().localeCompare(b.getDisplayName());
  };

  User.prototype.users = {};


  User.all = function()
  {
    return User.prototype.users;
  };

  User.list = function(mode) {
    mode = mode || 'objects';

    let userDb = User.prototype.users;
    let users = User.sortedIds('login');

    if (mode === 'objects') {
      for (let i=0; i<users.length; ++i) {
        users[i] = userDb[users[i]];
      }
    } else if (mode === 'id-login') {
      for (let i=0; i<users.length; ++i) {
        let u = userDb[users[i]];
        users[i] = [u.id, u.login];
      }
    } else {
      throw new CATMAID.ValueError("Unknown mode: " + mode);
    }

    return users;
  };

  /**
   * Return a list of all user IDs, sorted by the given field. If non is given,
   * the full name is used.
   */
  User.sortedIds = function(field) {
    field = field || 'fullName';
    var users = User.prototype.users;
    var userIds = Object.keys(users);
    userIds.sort(function(id1, id2) {
      var value1 = users[id1][field];
      var value2 = users[id2][field];
      if (undefined === value1 || undefined === value2) {
        throw new CATMAID.ValueError('Could not read field ' + field +
            ' of users ' + id1 + ' and ' + id2);
      }
      return CATMAID.tools.compareStrings(value1, value2);
    });
    return userIds;
  };

  /**
   * Returns a user object that matches the given ID or a dummy object if the ID
   * was not found.
   */
  User.safe_get = function(id)
  {
    if (User.prototype.users[id]) {
      return User.prototype.users[id];
    } else {
      return {
        // Return dummy instance
        id: id,
        login: 'unknown',
        fullName: 'unknown',
        firstName: 'unknown',
        lastName: 'unknown',
        color: new THREE.Color(1, 0, 0),
      };
    }
  };

  /**
   * Returns a display-friendly representation of the user whether or not it is
   * in the user cache.
   */
  User.safeToString = function (id) {
    var u = User.prototype.users[id];
    return u ? u.fullName + ' (' + u.login + ')' : ('unknown user ' + id);
  };

  /**
   * Gets the user object belonging the passed ID and calls the passed function
   * with this as parameter. If the user object is not available, an update of
   * the user cache is scheduled before.
   */
  User.auto_update_call = function(user_id, fn)
  {
    if (user_id in User.prototype.users) {
      fn(User.prototype.users[user_id]);
    } else {
      User.getUsers(function() {
        // Expect it to be there after the update, but use a safe fallback
        // option, if user information can't be obtained (e.g. because the
        // anonymous user doesn't haver permission).
        fn(User.safe_get(user_id));
      });
    }
  };

  User.getUsers = function(completionCallback)
  {
    // Asynchronously request the list of users from the server.
    return CATMAID.fetch('user-list')
      .then(function(json) {
        for (var i = 0; i < json.length; i++)
        {
          var userData = json[i];
          new User(userData.id, userData.login, userData.full_name,
              userData.first_name, userData.last_name, new THREE.Color(
                  userData.color[0], userData.color[1], userData.color[2]));
        }
      })
      .catch(CATMAID.handleError)
      .then(function() {
        CATMAID.tools.callIfFn(completionCallback);
      });
  };

  /**
   * This userprofile class represents options that are set for a particular user.
   */
  var Userprofile = function(profile) {
    // Store all recognized options as a member
    for (var field in this.getOptions()) {
      // Raise an error if an expected field does not exist.
      if (profile[field] === undefined || profile[field] === null) {
        throw "The initialization data for the user profile is lacking the '" +
            field + "' option!";
      }
      // Store the data if it is available
      this[field] = profile[field];
    }
  };

  /**
   * Returns an object with all user profile members along with an option
   * indicating whether users are allowed to modify these themselves.
   */
  Userprofile.prototype.getOptions = function() {
    return {
      independent_ontology_workspace_is_default: false,
      show_text_label_tool: false,
      show_tagging_tool: false,
      show_cropping_tool: false,
      show_tracing_tool: false,
      show_ontology_tool: false,
      show_roi_tool: false,
    };
  };

  /**
   * Makes the current user profile settings persistent in the back-end. Only
   * settings that the user is actually allowed to modify are saved.
   */
  Userprofile.prototype.saveAll = function(success, error) {
    // Find all options that can be modified by the user
    var options_to_save = {};
    var option_permissions = this.getOptions();
    for (var field in option_permissions) {
      if (option_permissions[field]) {
        options_to_save[field] = this[field];
      }
    }
    // Make the current set persistent
    CATMAID.fetch('user-profile/update', 'POST', options_to_save)
      .then(success)
      .catch(function(e) {
        CATMAID.warn("Couldn't update user settings!");
        error();
        CATMAID.handleError(e);
      });
  };

  // Make both User and Userprofile available in CATMAID namespace
  CATMAID.User = User;
  CATMAID.Userprofile = Userprofile;

})(CATMAID);
