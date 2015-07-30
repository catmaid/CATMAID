/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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
      color: new THREE.Color().setRGB(255, 0, 0),
    };
  }
};

/**
 * Returns a display-friendly representation of the user where or not it is in
 * the user cache.
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
      // Expect it to be there after the update
      fn(User.prototype.users[user_id]);
    });
  }
};

User.getUsers = function(completionCallback)
{
  // Asynchronously request the list of users from the server.
  requestQueue.register(django_url + 'user-list',
      'GET',
      undefined,
      function (status, text, xml) {
        if (status == 200 && text)
        {
          var jsonData = $.parseJSON(text);
          for (var i = 0; i < jsonData.length; i++)
          {
            var userData = jsonData[i];
            new User(userData.id, userData.login, userData.full_name,
                userData.first_name, userData.last_name, new THREE.Color().setRGB(
                    userData.color[0], userData.color[1], userData.color[2]));
          }
        }
        else
        {
          new CATMAID.ErrorDialog("The list of users could not be " +
              "retrieved.", text + "\n\n(Status: " + status + ")").show();
        }
        if (completionCallback !== undefined) {
          completionCallback();
        }
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
    inverse_mouse_wheel: true,
    display_stack_reference_lines: true,
    independent_ontology_workspace_is_default: false,
    show_text_label_tool: false,
    show_tagging_tool: false,
    show_cropping_tool: false,
    show_segmentation_tool: false,
    show_tracing_tool: false,
    show_ontology_tool: false,
    show_roi_tool: false,
    tracing_overlay_screen_scaling: true,
    tracing_overlay_scale: true,
    prefer_webgl_layers: true,
    use_cursor_following_zoom: true
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
  requestQueue.register(django_url + 'user-profile/update',
      'POST',
      options_to_save,
      function (status, text, xml) {
        if (status == 200 && text) {
            var e = $.parseJSON(text);
            if (e.error) {
              new CATMAID.ErrorDialog("Couldn't update user settings!",
                  e.error).show();
              if (error) {
                  error();
              }
            } else if (success){
                success();
            }
        } else {
            new CATMAID.ErrorDialog("Couldn't update user settings!",
                "Updating the user profile returned an unexpected status: " +
                status).show();
            if (error) {
                error();
            }
        }
      });
};
