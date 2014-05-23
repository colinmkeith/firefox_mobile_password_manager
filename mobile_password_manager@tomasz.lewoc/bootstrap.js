/*
 * Mobile Password Manager for Firefox for Android
 */
 
/*
 * ==== imports ====
 */

const Cc = Components.classes; 
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

/*
 * ==== "fields" ====
 */

const DOCUMENT_URL = "chrome://mobile_password_manager/content/viewer.html";
const IMAGE_PATH = "chrome/content/assets/mdpi_key.png";
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const availableLocales = ["en-US"]; //the locales this add-on has been translated into
var addonData;
var mobileMenuItem;
var mobileContextMenuItem;
var defaultPreferences;
var preferences;
var stringBundle;

/*
 * ==== main functions ====
 */

function loadIntoWindow(window) {

	if (!window)
		return;

	if (desktop()) {
	
		/* attach to the new, orange Firefox menu in the top left */
		var orangeMenu = window.document.getElementById("appmenuSecondaryPane");
		var insertBeforeThis = window.document.getElementById("appmenu_customize");
		if (orangeMenu && insertBeforeThis) {
			var orangeMenuItem = window.document.createElementNS(XUL_NS, "menuitem");
			orangeMenuItem.setAttribute("id", "mobile_password_manager-orange_menu_item");
			orangeMenuItem.setAttribute("label", "Password Manager"); //shortened the name since it would inflate the box otherwise; the icon is displayed so there should be no confusion
			orangeMenuItem.setAttribute("class", "menuitem-iconic"); //menuitem-iconic-tooltip seemed unnecessary
			/* desktop Firefox 22 scales all interface elements in accordance with the OS' DPI settings, 
			 * hence the very large 72x72px image - this will ensure FF always downscales it and never has to upscale it */
			orangeMenuItem.style.listStyleImage = "url(chrome://mobile_password_manager/content/assets/hdpi.png)";
			
			orangeMenuItem.addEventListener("command", function () {
				openInWindow(window);
			}, true);
			
			orangeMenu.insertBefore(orangeMenuItem, insertBeforeThis);
		}

		/* attach to the tools menu */
		var toolsMenu = window.document.getElementById("menu_ToolsPopup");
		if(toolsMenu) {
			var toolsMenuMenu = window.document.createElementNS(XUL_NS, "menu");
			toolsMenuMenu.setAttribute("id", "mobile_password_manager-tools_menu_menu");
			toolsMenuMenu.setAttribute("label", "Password Manager"); //although the tools menu has more room, the name is also shortened here for consistency; the icon is present for identification
			toolsMenuMenu.setAttribute("class", "menu-iconic");
			toolsMenuMenu.setAttribute("accesskey", "e");
			toolsMenuMenu.style.listStyleImage = "url(chrome://mobile_password_manager/content/assets/hdpi.png)";

			var toolsMenuPopup = window.document.createElementNS(XUL_NS, "menupopup");
			toolsMenuMenu.appendChild(toolsMenuPopup);

			var toolsMenuItem0 = window.document.createElementNS(XUL_NS, "menuitem");
			toolsMenuItem0.setAttribute("label", stringBundle.GetStringFromName("desktopManageExisting"));
			toolsMenuItem0.addEventListener("command", function() {
				openInWindow(window);
			}, true);
			toolsMenuItem0.setAttribute("accesskey", "e");
			toolsMenuPopup.appendChild(toolsMenuItem0);

			var toolsMenuItem1 = window.document.createElementNS(XUL_NS, "menuitem");
			toolsMenuItem1.setAttribute("label", stringBundle.GetStringFromName("desktopAddNew"));
			toolsMenuItem1.addEventListener("command", function() {
				guessFromPasswordField(window, window.content.document.querySelector("input[type=password]"), extractHostnameFromUrl(window.content.document.documentURI));
			}, true);
			toolsMenuItem1.setAttribute("accesskey", "A");
			toolsMenuPopup.appendChild(toolsMenuItem1);

			toolsMenu.appendChild(toolsMenuMenu);
		}
		
	} else { //Android

		Cu.reportError(addonData.resourceURI.spec + IMAGE_PATH);
	
		mobileMenuItem = window.NativeWindow.menu.add(stringBundle.GetStringFromName("mobileMenuItem"), addonData.resourceURI.spec + IMAGE_PATH, function() { //a null icon (defaulting to the puzzle piece icon) is widely used by add-ons, so I'm following suit
			openInWindow(window);
		});
		
		mobileContextMenuItem = window.NativeWindow.contextmenus.add(stringBundle.GetStringFromName("mobileContextMenuItem"), window.NativeWindow.contextmenus.SelectorContext("input[type=password]:not(#mobile_password_manager_cant_touch_this"), function(target) { //no ellipsis in the name since Firefox's built-in "add search engine" item doesn't have one either - I'm following suit
			guessFromPasswordField(window, target, extractHostnameFromUrl(window.content.document.documentURI));
		});
	
	}
}

/* 
 * takes an HTML input element (the password field) and analyzes its parent form
 * in an attempt to guess the username field name and form submit URL 
 * 
 * to avoid a potential security issue, the actual username and password
 * are currently not extracted - the code was commented out
 * I'm not sure if I even want this functionality in the first place
 */
function guessFromPasswordField(window, passwordField, hostname) {

	if(!passwordField) {
		promptUser(window, hostname);
		return;
	}
	
	//target is an input node of type password
	var passwordFieldName = encodeURIComponent(passwordField.name);
	//var password = passwordField.value;
	
	var form = passwordField.form;

	var inputs = form.getElementsByTagName("input");

	var flag = false;
	for(var i=inputs.length-1; i>=0; i=i-1) {
		if(!flag && inputs.item(i) == passwordField)
			flag = true;
		
		if(flag) {
			var inputType = inputs[i].type;
			if(!inputType || inputType == "email" || inputType == "tel" || inputType == "text" || inputType == "url") {
				var usernameFieldName = encodeURIComponent(inputs[i].name);
				//var username = inputs[i].value;
				break;
			}
		}
	}
	
	if(!passwordFieldName || !usernameFieldName) {
		promptUser(window, hostname);
		return;
	}
	
	var formSubmitUrl = form.action ? encodeURIComponent(extractHostnameFromUrl(form.action)) : encodeURIComponent(hostname);
	
	var queryString = "hostname=" + hostname + "&usernameField=" + usernameFieldName + "&passwordField=" + passwordFieldName + "&formSubmitUrl=" + formSubmitUrl;
	/* if(username)
		queryString += ("&username=" + username);
	if(password)
		queryString += ("&passwordHash=" + window.btoa(password)); */ //just to ward against onlookers - prevents the password from being visible in plain text in the Awesome Bar
	openInWindow(window, queryString);

}

function promptUser(window, hostname) {
	var shouldContinue = Services.prompt.confirm(null, "Mobile Password Manager", "Couldn't guess the username and password field names from the current page. Continue with just the hostname?");

	if(shouldContinue)
		openInWindow(window, "hostname=" + hostname);
	
}

/*
 * ==== auxiliary functions ====
 */

function desktop() {
	var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
	return (appInfo.ID == "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"); //desktop Firefox
}

function extractHostnameFromUrl(urlString) {
	var hostname = urlString.replace(/([^\/])\/([^\/]).*/, "$1");
	
	if(hostname.lastIndexOf("\/") == hostname.length - 1) //remove any trailing slash
		hostname = hostname.substring(0, hostname.length - 1);
	
	return hostname;
}

function openInWindow(window, queryString) {

	if(desktop()) { //on a desktop, search *all* windows for a tab already open with the add-on - the window argument is only used if no tab is found a new one needs to be opened
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var browserEnumerator = wm.getEnumerator("navigator:browser");

		var flag = false;
		while (!flag && browserEnumerator.hasMoreElements()) {
			var browserWin = browserEnumerator.getNext();
			var tabBrowser = browserWin.gBrowser;

			for (var i=0; i<tabBrowser.browsers.length; i++) {
				if (tabBrowser.browsers[i].currentURI.spec.indexOf(DOCUMENT_URL) == 0) {
					tabBrowser.selectedTab = tabBrowser.tabContainer.childNodes[i];
					
					if(queryString)
						tabBrowser.loadURI(DOCUMENT_URL + "?" + queryString); //this will force a reload if the exact same URL is - somehow - already open, which is good since it'll make for a consistent UX
		
					browserWin.focus();
					flag = true;
					break;
				}
			}
		}
		if(!flag)
			window.gBrowser.selectedTab = window.gBrowser.addTab(queryString ? DOCUMENT_URL + "?" + queryString : DOCUMENT_URL);


	} else { //Android
		var tabs = window.BrowserApp.tabs;
		var flag = false;
		for(var i=0; i<tabs.length; i++) {
			if(tabs[i].window.location.toString().indexOf(DOCUMENT_URL) == 0) {
				window.BrowserApp.selectTab(tabs[i]);
				
				if(queryString)
					tabs[i].browser.loadURI(DOCUMENT_URL + "?" + queryString); //again, this will always force a reload, which is good

				flag = true;
				break;
			}
		}
		if(!flag)
			var newTab = window.BrowserApp.addTab(queryString ? DOCUMENT_URL + "?" + queryString : DOCUMENT_URL);

	}

}

/* close all tabs in the window which have viewer.html open */
function closeInWindow(window) {

	if(desktop()) {

		var tabBrowser = window.gBrowser;

		for (var i=tabBrowser.browsers.length-1; i>=0; i=i-1) {
			if (tabBrowser.browsers[i].currentURI.spec.indexOf(DOCUMENT_URL) == 0) {
				if(tabBrowser.tabContainer.childNodes.length == 1) {
					var newTab = tabBrowser.addTab("about:blank");
					tabBrowser.removeAllTabsBut(newTab);
				} else {
					tabBrowser.removeTab(tabBrowser.tabContainer.childNodes[i]);
				}
			}
		}

	} else { //Android

		var tabs = window.BrowserApp.tabs;
		var tabsToClose = new Array();

		for(var i=window.BrowserApp.tabs.length-1; i>=0; i=i-1) {
			if(window.BrowserApp.tabs[i].window.location.toString().indexOf(DOCUMENT_URL) == 0) {
				var tabToRemove = window.BrowserApp.tabs[i];
				
				if(window.BrowserApp.tabs.length == 1)
					window.BrowserApp.addTab("about:home");

				window.BrowserApp.closeTab(tabToRemove)
			}
		}

	}

}

function unloadFromWindow(window) {

	if (!window)
		return;

	if (desktop()) {

		var orangeMenu = window.document.getElementById("appmenuSecondaryPane");
		if(orangeMenu) {
			var menuItem = orangeMenu.querySelector("#mobile_password_manager-orange_menu_item");
			orangeMenu.removeChild(menuItem);
		}

		var toolsMenu = window.document.getElementById("menu_ToolsPopup");
		if(toolsMenu) {
			var toolsMenuMenu = toolsMenu.querySelector("#mobile_password_manager-tools_menu_menu");
			toolsMenu.removeChild(toolsMenuMenu);
		}

	} else {
		window.NativeWindow.menu.remove(mobileMenuItem);
		window.NativeWindow.contextmenus.remove(mobileContextMenuItem);
	}
	
	closeInWindow(window);
	
}

var windowListener = {
	onOpenWindow: function(aWindow) {
		var domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		domWindow.addEventListener("load", function() {
			domWindow.removeEventListener("load", arguments.callee, false);
			loadIntoWindow(domWindow);
		}, false);
	},

	onCloseWindow: function(aWindow) {
	},
  
	onWindowTitleChange: function(aWindow, aTitle) {
	}
};

/*
 * ==== bootstrap  ====
 */

function startup(aData, aReason) {

	addonData = aData;

	defaultPreferences = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getDefaultBranch("extensions.mobile_password_manager.");
	defaultPreferences.setBoolPref("show_search_tip", true);
	defaultPreferences.setBoolPref("show_adding_tip", true);
	defaultPreferences.setBoolPref("warn_before_copying", true);
	preferences = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("extensions.mobile_password_manager.");
	
	var locale = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale("global");
	if(!locale || availableLocales.indexOf(locale) == -1)
		locale = "en-US";
	var filePath = addonData.resourceURI.spec + "chrome/locale/" + locale + "/bootstrap.properties";
	stringBundle = Cc["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle(filePath);

	var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
	var windows = wm.getEnumerator("navigator:browser");
	while (windows.hasMoreElements()) { // Load into any existing windows
		var domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
		loadIntoWindow(domWindow);
	}
	wm.addListener(windowListener); // Load into any new windows

}

function shutdown(aData, aReason) {

	if (aReason == APP_SHUTDOWN)
		return;

	var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
	wm.removeListener(windowListener); // Stop listening for new windows
	let windows = wm.getEnumerator("navigator:browser");
	while (windows.hasMoreElements()) { // Unload from any existing windows
		let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
		unloadFromWindow(domWindow);
	}

}

function install(aData, aReason) { }

function uninstall(aData, aReason) { }
