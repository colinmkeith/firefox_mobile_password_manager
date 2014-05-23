/*
 * Mobile Password Manager for Firefox for Android
 */

/*
 * ==== imports ====
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper);
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

/*
 * ==== "fields" ====
 */

const availableLocales = ["en-US"]; //the locales this add-on has been translated into
var pwTable;
var loginManager;
var nsLoginInfo;
var loginToReplace;
var rowToReplace;
var preferences;
var toastTimer;
var stringBundle;

/*
 * ==== initialization ====
 */

function initializeSomeStuff() {

	/* initialize some stuff */
	preferences = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("extensions.mobile_password_manager.");
	pwTable = document.getElementById("pw_table");
	loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
	nsLoginInfo = new Components.Constructor(
		"@mozilla.org/login-manager/loginInfo;1",
		Components.interfaces.nsILoginInfo,
		"init"
	);
	
	AddonManager.getAddonByID("mobile_password_manager@tomasz.lewoc", function(addon) {
	
		var locale = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale("global");
		if(!locale || availableLocales.indexOf(locale) == -1)
			locale = "en-US";
		var filePath = addon.getResourceURI().spec;
		if(filePath.lastIndexOf("\/") != filePath.length - 1) //if there is no trailing slash, the extension is inside its archive, which is expected
			filePath = "jar:" + filePath + "!\/";
		filePath += "chrome/locale/" + locale + "/viewer.properties";
		Cu.reportError(filePath);
		stringBundle = Cc["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle(filePath);

		localizeInterface();
		
		/* make a minor interface adjustment if running on a desktop */
		if(desktop()) {
			var div = document.createElement("div");
			div.setAttribute("id", "scrollbar_cover");
			document.getElementById("viewer_activity").appendChild(div);
		}
		
		/* retrieve and display all logins */
		try {
			var logins = loginManager.getAllLogins();
		} catch(e) { //master password was not entered
			showTip("The master password was not entered. Reload this page to try again.");
			var imageButton = document.getElementById("add_button");
			if(imageButton)
				imageButton.parentNode.removeChild(imageButton);
			imageButton = document.getElementById("tip_close_button");
			if(imageButton)
				document.body.removeChild(imageButton);
			
			return;
		}
		
		logins.sort(function(a,b) { //sort the array in reverse lexicographical order by hostname, so that each row can be inserted at index 0 into the HTML table
			if(a.hostname < b.hostname)
				return 1;
			if(a.hostname > b.hostname)
				return -1;
			
			return 0;
		});
		
		for (var i = 0; i < logins.length; i++) {
			var row = pwTable.insertRow(0);
			fillHtmlRow(row, logins[i]);
		}
		
		var urlString = window.location
		if(window.location.toString().indexOf("?") != -1) { //if there's a query string, start adding a new entry using data from the query string
			
			preferences.setBoolPref("show_search_tip", false); //the user has already used the function, don't inform them about its existence
			
			var queryArr = parseQueryString(window.location);
			
			document.getElementById("login_type").setAttribute("disabled", "disabled");
			document.getElementById("in_hostname").value = queryArr["hostname"];
			if(queryArr["formSubmitUrl"])
				document.getElementById("in_form_submit_url").value = queryArr["formSubmitUrl"];
			/*if(queryArr["username"])
				document.getElementById("in_username").value = queryArr["username"];
			if(queryArr["passwordHash"])
				document.getElementById("mobile_password_manager_cant_touch_this").value = document.defaultView.atob(queryArr["passwordHash"]); */ //the Base64 encoding was just to ward against onlookers - it prevents the password from being visible in plain text in the Awesome Bar
			if(queryArr["usernameField"])
				document.getElementById("in_username_field").value = queryArr["usernameField"];
			if(queryArr["passwordField"])
				document.getElementById("in_password_field").value = queryArr["passwordField"];
			
			/* switch "activities" */
			dismissTip();
			document.getElementById("editor_activity").removeAttribute("style");
			document.getElementById("viewer_activity").setAttribute("style", "display:none");
			
			return;
		}

		/* show the search tip if this is the first run */
		var showSearchTip = preferences.getBoolPref("show_search_tip");
		if(showSearchTip) {
			showTip(desktop() ? stringBundle.GetStringFromName("desktopSearchTip") : stringBundle.GetStringFromName("mobileSearchTip"));
			preferences.setBoolPref("show_search_tip", false);
		}

    var filter = document.getElementById('filter');
    if(filter) {
      var filterWhich = document.getElementById('filterwhich');
      if(filterWhich) {
	      filterWhich.addEventListener("click", startFiltering, true);
	      filterWhich.addEventListener("change", startFiltering, true);
	      filter.addEventListener("keyup", startFiltering, true);
      }
    }

	});
}

function startFiltering(event) {
  var filterPattern = document.getElementById('filter').value;  
  var filterWhich   = document.getElementById('filterwhich').value;  

  var hiddenNodes   = document.querySelectorAll('#pw_table tr.filtered');
  for(var i=0; i<hiddenNodes.length; i++) {
    hiddenNodes[i].className = '';
  }

  if(!filterPattern) {
    return;
  }

  var selector = '';

  if(filterWhich == 1 || filterWhich == 2) {
    selector = '#pw_table td:nth-child(1)';
  }

  if(filterWhich == 1 || filterWhich == 3) {
    if(selector) {
      select += ', ';
    }
    selector += '#pw_table td:nth-child(2)';
  }

  try {
    var nodes = document.querySelectorAll(selector);
    for(var i=0; i<nodes.length; i++) {
      if(!nodes[i].innerHTML.match(filterPattern)) {
        nodes[i].parentNode.className = 'filtered';
      }
    }
  } catch(e) {
    showTip("The pattern is invalid.");
  }

}

/*
 * ==== the viewer "activity" ====
 */

function copyUsername(event) {
	var hostname = event.target.parentNode.parentNode.firstChild.innerHTML;
	var hypertext = event.target.parentNode.parentNode.childNodes[1].innerHTML;
	var indexOfTerminator = hypertext.indexOf(">");
	var username = hypertext.slice(indexOfTerminator + 2);
	
	if(username) {
		clipboardHelper.copyString(username);
		var args = [username, hostname];
		toast(stringBundle.formatStringFromName("usernameCopiedToast", args, args.length));
	} else {
		toast(stringBundle.GetStringFromName("emptyUsernameToast"));
	}
}

function copyPassword(event) {
	/* 
	 * warn the user the first time they use this
	 *
	 * IMO, it's better make this preference check here every time
	 * than check once on startup and manipulate dozens of event listeners on buttons
	 */
	var warnUser = preferences.getBoolPref("warn_before_copying");
	if(warnUser) {
		var check = {value: true};
		var shouldContinue = Services.prompt.confirmCheck(null, "Mobile Password Manager", stringBundle.GetStringFromName("passwordCopyWarning"), stringBundle.GetStringFromName("passwordCopyCheckbox"), check);
		if(!shouldContinue)
			return;
		if(check.value)
			preferences.setBoolPref("warn_before_copying", false);
	}

	var hostname = event.target.parentNode.parentNode.firstChild.innerHTML.toString();
	var hypertext = event.target.parentNode.parentNode.childNodes[1].innerHTML;
	var indexOfTerminator = hypertext.indexOf(">");
	var username = hypertext.slice(indexOfTerminator + 2);
	
	if(username) {
		var args = [username, hostname];
		toast(stringBundle.formatStringFromName("longUsernameCopiedToast", args, args.length));
	} else {
		var args = [hostname];
		toast(stringBundle.formatStringFromName("shortUsernameCopeidToast", args, args.length));
	}
	
	clipboardHelper.copyString(event.target.parentNode["data-password"]);
}

function startDeleting(event) {
	var htmlRow = event.target.parentNode.parentNode;
	var loginInfo = htmlRow["data-login_info"];
	
	if(loginInfo.username)
		var username = loginInfo.username + " at ";
	else
		username = "";
	
	var shouldDelete = Services.prompt.confirm(null, "Mobile Password Manager", "Delete the saved login information for " + username + loginInfo.hostname + "?");
	
	if(shouldDelete) {
		loginManager.removeLogin(loginInfo);
	
		for(var i=0; i<pwTable.rows.length; i++) {
			if(pwTable.rows[i] == htmlRow) {
				pwTable.deleteRow(i);
				break;
			}
		}
	}
}

function startEditing(event) {
	var loginInfo = event.target.parentNode.parentNode["data-login_info"];
	
	/* prepare the editor "activity" */
	if(loginInfo) { //if loginInfo was supplied, we're editing an entry, otherwise we're creating a new one
		document.getElementById("editor_activity_title").innerHTML = "Editing";
		document.getElementById("login_type").setAttribute("disabled", "disabled");
		if(loginInfo.httpRealm) {
			document.getElementById("login_type").value = "http_auth";
			updateForm();
		}
		loginToReplace = loginInfo;
		rowToReplace = event.target.parentNode.parentNode;
		document.getElementById("in_hostname").value = loginInfo.hostname;
		document.getElementById("in_form_submit_url").value = loginInfo.formSubmitURL;
		document.getElementById("in_realm").value = loginInfo.httpRealm;
		document.getElementById("in_username").value = loginInfo.username;
		document.getElementById("mobile_password_manager_cant_touch_this").value = loginInfo.password;
		document.getElementById("in_username_field").value = loginInfo.usernameField;
		document.getElementById("in_password_field").value = loginInfo.passwordField;
		
		var showAddingTip = false;
	} else {
		var showAddingTip = preferences.getBoolPref("show_adding_tip");
	}

	/* switch "activities" */
	dismissTip();
	document.getElementById("editor_activity").removeAttribute("style");
	document.getElementById("viewer_activity").setAttribute("style", "display:none");
	
	if(showAddingTip) {
		showTip(desktop() ? stringBundle.GetStringFromName("desktopAddingTip") : stringBundle.GetStringFromName("mobileAddingTip"));
		preferences.setBoolPref("show_adding_tip", false);
	}

}

function showTip(tip) {

	dismissTip();
	
	var scrollbarCover = document.getElementById("scrollbar_cover");
	if(scrollbarCover)
		scrollbarCover.setAttribute("style", "display: none");

	var div = document.createElement("div");
	div.setAttribute("id", "tip_container");
	
	var paragraph = document.createElement("p");
	paragraph.appendChild(document.createTextNode(tip));
	div.appendChild(paragraph);
	
	var imageButton = document.createElement("img");
	imageButton.setAttribute("id", "tip_close_button");
	//imageButton.setAttribute("onclick", "dismissTip()");
	imageButton.addEventListener("click", dismissTip, true);
	imageButton.src = "chrome://mobile_password_manager/content/assets/cancel.png";
	imageButton.alt = "Dismiss";

	if(document.getElementById("viewer_activity").style.display == "none") { //we're in the editor
		document.getElementById("form_table_wrapper").style.top = "82pt"; //increased by 45
		document.getElementById("editor_activity").insertBefore(div, document.getElementById("form_table_wrapper"));
	} else { //we're in the viewer
		document.getElementById("pw_table_wrapper").style.top = "141pt"; //increased by 45 + 45
		document.getElementById("viewer_activity").insertBefore(div, document.getElementById("header_table_wrapper"));
	}
	document.body.appendChild(imageButton);

}

function dismissTip() {

	var scrollbarCover = document.getElementById("scrollbar_cover");
	if(scrollbarCover)
		scrollbarCover.removeAttribute("style");

	var div = document.getElementById("tip_container");
	if(div) {
		div.parentNode.removeChild(div);
		document.getElementById("form_table_wrapper").removeAttribute("style");
		document.getElementById("pw_table_wrapper").removeAttribute("style");
	}
	
	var imageButton = document.getElementById("tip_close_button");
	if(imageButton)
		document.body.removeChild(imageButton);
}

/*
 * ==== the editor "activity" ====
 */

function saveChanges() {

	if(document.getElementById("login_type").value == "http_auth") {
		var formSubmitUrl = null;
		var realm = document.getElementById("in_realm").value;
		var usernameField = "";
		var passwordField = "";
	} else {
		var formSubmitUrl = document.getElementById("in_form_submit_url").value;
		var realm = null;
		var usernameField = document.getElementById("in_username_field").value;
		var passwordField = document.getElementById("in_password_field").value;
	}
	var newLoginInfo = new nsLoginInfo(
		document.getElementById("in_hostname").value,
		formSubmitUrl,
		realm,
		document.getElementById("in_username").value,
		document.getElementById("mobile_password_manager_cant_touch_this").value,
		usernameField,
		passwordField
	);
	
	var usernameField = document.getElementById("in_username_field").value;

	
	try {
		if(loginToReplace) { //editing
			loginManager.modifyLogin(loginToReplace, newLoginInfo);
		} else { //adding
			loginManager.addLogin(newLoginInfo);
		}
		
		//if we got here, the data was saved successfully
		if(rowToReplace) { //delete the old row
			for(var i=0; i<pwTable.rows.length; i++) {
				if(pwTable.rows[i] == rowToReplace) {
					pwTable.deleteRow(i);
					break;
				}
			}
		}
		//insert the new row
		if(newLoginInfo.httpRealm)
			var displayedHostname = newLoginInfo.hostname + " (" + newLoginInfo.httpRealm + ")";
		else
			var displayedHostname = newLoginInfo.hostname;

		if(pwTable.rows[0].firstChild.innerHTML >= displayedHostname) {
			var newRow = pwTable.insertRow(0);
			fillHtmlRow(newRow, newLoginInfo);
		} else {
			for(var i=0; i<pwTable.rows.length; i++) {
				if(pwTable.rows[i].firstChild.innerHTML < displayedHostname && (i == pwTable.rows.length-1 || pwTable.rows[i+1].firstChild.innerHTML >= displayedHostname)) {
					var newRow = pwTable.insertRow(i+1);
					fillHtmlRow(newRow, newLoginInfo);
					break;
				}
			}
		}
		
		//if we got here, the changes were saved successfully
		clearAndCloseEditor();
		
	} catch(e) {
		if(e.message.lastIndexOf("'") < 1) { //looks like an empty or unusual message - should never occur
			Cu.reportError(e);
			toast(stringBundle.GetStringFromName("unusualErrorToast"), true);
		} else { //exceptions raised by nsILoginManager are very user-friendly, so let's display the exception message
			var messageToDisplay = e.message.slice(1);
			var index = messageToDisplay.lastIndexOf("'");
			var messageToDisplay = messageToDisplay.substring(0, index);
			toast(messageToDisplay, true);
		}
	}
}

function togglePasswordVisibility(event) {
	if(document.getElementById("mobile_password_manager_cant_touch_this").type == "password") {
		document.getElementById("mobile_password_manager_cant_touch_this").setAttribute("type", "text");
		event.target.src = "chrome://mobile_password_manager/content/assets/hide.png";
		event.target.alt = stringBundle.GetStringFromName("toggleImageAltHide");
	} else {
		document.getElementById("mobile_password_manager_cant_touch_this").setAttribute("type", "password");
		event.target.src = "chrome://mobile_password_manager/content/assets/show.png"
		event.target.alt = stringBundle.GetStringFromName("toggleImageAltShow");
	}
}

function clearAndCloseEditor() {
	document.getElementById("editor_activity_title").innerHTML = "Adding";
	document.getElementById("login_type").value = "web_form";
	updateForm();
	document.getElementById("login_type").removeAttribute("disabled");
	loginToReplace = null;
	rowToReplace = null;
	document.getElementById("editor_form").reset();
	updateForm();
	
	/* switch "activities" */
	dismissTip();
	document.getElementById("editor_activity").setAttribute("style", "display:none");
	document.getElementById("viewer_activity").removeAttribute("style");
}

/*
 * ==== auxiliary functions ====
 */
 
function desktop() {
	var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
	return (appInfo.ID == "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"); //desktop Firefox
}

function parseQueryString(urlString) {
	var match;
	var search = /([^&=]+)=?([^&]*)/g;
	var query = urlString.search.substring(1);

	var queryArr = {};
	while (match = search.exec(query))
       queryArr[match[1]] = decodeURIComponent(match[2]);
	
	return queryArr;
}

function toast(text, useLongDuration) {

	if(desktop()) {
		createDesktopToast(text, useLongDuration ? 4000 : 2500);
		return;
	}

	var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
	var browserWindow = wm.getMostRecentWindow('navigator:browser');
	browserWindow.NativeWindow.toast.show(text, useLongDuration ? "long" : "short");

}

function fillHtmlRow(row, loginInfo) {

	row["data-login_info"] = loginInfo; //not storing the entire nsILoginInfo here would make editing difficult, the nsILoginManager is picky

	var hostname = loginInfo.hostname;
	var username = loginInfo.username;
	var password = loginInfo.password;
	if(loginInfo.httpRealm)
		hostname += " (" + loginInfo.httpRealm + ")";

	var cell0 = row.insertCell(0);
	var cell1 = row.insertCell(1);
	var cell2 = row.insertCell(2);

	/* leftmost cell */
	cell0.appendChild(document.createTextNode(hostname));

	/* middle cell */
	var image = document.createElement("img");
	image.src = "chrome://mobile_password_manager/content/assets/copy.png";
	image.addEventListener("click", copyUsername, true);
	cell1.appendChild(image);
	cell1.appendChild(document.createTextNode(" " + username));
	
	/* rightmost cell */
	image = document.createElement("img");
	image.src = "chrome://mobile_password_manager/content/assets/copy.png";
	image.addEventListener("click", copyPassword, true);
	cell2.appendChild(image);
	cell2.appendChild(document.createTextNode(" "));
	image = document.createElement("img");
	image.src = "chrome://mobile_password_manager/content/assets/edit.png";
	image.addEventListener("click", startEditing, true);
	cell2.appendChild(image);
	cell2.appendChild(document.createTextNode(" "));
	image = document.createElement("img");
	image.src = "chrome://mobile_password_manager/content/assets/discard.png";
	image.addEventListener("click", startDeleting, true);
	cell2.appendChild(image);
	cell2["data-password"] = password;

}

/* updates the form in the editor "activity" to reflect the value of the "type" drop-down box */
function updateForm() {
	if(document.getElementById("login_type").value == "http_auth") {
		document.getElementById("in_form_submit_url").setAttribute("disabled", "disabled");
		document.getElementById("in_form_submit_url").parentNode.parentNode.setAttribute("style", "display: none");
		document.getElementById("in_username_field").setAttribute("disabled", "disabled");
		document.getElementById("in_username_field").parentNode.parentNode.setAttribute("style", "display: none");
		document.getElementById("in_password_field").setAttribute("disabled", "disabled");
		document.getElementById("in_password_field").parentNode.parentNode.setAttribute("style", "display: none");
		document.getElementById("in_realm").removeAttribute("disabled");
		document.getElementById("in_realm").parentNode.parentNode.removeAttribute("style");
	} else {
		document.getElementById("in_form_submit_url").removeAttribute("disabled");
		document.getElementById("in_form_submit_url").parentNode.parentNode.removeAttribute("style");
		document.getElementById("in_username_field").removeAttribute("disabled");
		document.getElementById("in_username_field").parentNode.parentNode.removeAttribute("style");
		document.getElementById("in_password_field").removeAttribute("disabled");
		document.getElementById("in_password_field").parentNode.parentNode.removeAttribute("style");
		document.getElementById("in_realm").setAttribute("disabled", "disabled");
		document.getElementById("in_realm").parentNode.parentNode.setAttribute("style", "display: none");
	}
}

function createDesktopToast(text, duration) {

	if(toastTimer)
		clearTimeout(toastTimer);

	dismissDesktopToast();
	
	var toaster = document.createElement("div");
	toaster.setAttribute("id", "toaster");
	
	var paragraph = document.createElement("p");
	paragraph.appendChild(document.createTextNode(text));
	toaster.appendChild(paragraph);
	
	document.body.appendChild(toaster);
	
	toastTimer = setTimeout(function() { dismissDesktopToast() }, duration);
}

function dismissDesktopToast() {
	var toaster = document.getElementById("toaster");
	if(toaster)
		document.body.removeChild(toaster);
}

function localizeInterface() {
	document.getElementById("action_bar_title").appendChild(document.createTextNode(" " + stringBundle.GetStringFromName("actionBarTitle")));
	document.getElementById("add_image").alt = stringBundle.GetStringFromName("addImageAlt");
	document.getElementById("site_column_header").appendChild(document.createTextNode(stringBundle.GetStringFromName("siteColumnHeader")));
	document.getElementById("username_column_header").appendChild(document.createTextNode(stringBundle.GetStringFromName("usernameColumnHeader")));
	document.getElementById("password_column_header").appendChild(document.createTextNode(stringBundle.GetStringFromName("passwordColumnHeader")));

	document.getElementById("editor_activity_title").appendChild(document.createTextNode(stringBundle.GetStringFromName("editorAdding")));
	document.getElementById("action_bar_cancel_button").appendChild(document.createTextNode(stringBundle.GetStringFromName("editorCancel")));
	document.getElementById("action_bar_save_button").appendChild(document.createTextNode(stringBundle.GetStringFromName("editorSave")));
	
	document.getElementById("form_type_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formType")));
	document.getElementById("web_form_option").appendChild(document.createTextNode(stringBundle.GetStringFromName("formWebForm")));
	document.getElementById("http_auth_option").appendChild(document.createTextNode(stringBundle.GetStringFromName("formHttpAuth")));
	document.getElementById("form_hostname_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formHostname")));
	document.getElementById("form_submit_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formSubmit")));
	document.getElementById("form_realm_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formRealm")));
	document.getElementById("form_username_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formUsername")));
	document.getElementById("form_password_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formPassword")));
	document.getElementById("form_username_field_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formUsernameField")));
	document.getElementById("form_password_field_label").appendChild(document.createTextNode(stringBundle.GetStringFromName("formPasswordField")));
}
