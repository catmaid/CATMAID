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
	if (status === 200 && text)
	{
		var jsonData = $.parseJSON(text);
		jsonData.forEach(function(userData) {
			new User(userData.id, userData.login, userData.full_name, userData.first_name, userData.last_name, 
			         new THREE.Color().setRGB(userData.color[0], userData.color[1], userData.color[2]));
		});
	}
	else
	{
		alert("The list of users could not be retrieved:\n\n\t" + text + "\n\n(" + status + ")");
	}
};
