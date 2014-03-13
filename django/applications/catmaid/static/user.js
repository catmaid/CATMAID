function User(userID, login, fullName, firstName, lastName, color)
{
	if (userID !== undefined && login === undefined && fullName === undefined && firstName === undefined && 
		lastName === undefined && color === undefined)
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
};


User.prototype.users = {};


User.all = function()
{
	return User.prototype.users;
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
								User.prototype.handleGetUsers(status, text, xml);
								if (completionCallback !== undefined) {
									completionCallback();
								}
							});
};


User.prototype.handleGetUsers = function(status, text, xml)
{
	if (status == 200 && text)
	{
		var jsonData = $.parseJSON(text);
		for (var i = 0; i < jsonData.length; i++)
		{
			var userData = jsonData[i];
			new User(userData.id, userData.login, userData.full_name, userData.first_name, userData.last_name, 
			         new THREE.Color().setRGB(userData.color[0], userData.color[1], userData.color[2]));
		}
	}
	else
	{
		new ErrorDialog("The list of users could not be retrieved.",
			text + "\n\n(Status: " + status + ")").show();
	}
};
