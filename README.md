firefox_mobile_password_manager
===============================

This project is a clone/fork of *Tomasz Lewoc's* very handy [Firefox Addon Mobile Password Manager](https://addons.mozilla.org/en-US/android/addon/mobile-password-manager) to add support for filtering the passwords.

This is needed because on a small screen device, say an android phone, all you can see is the first portion of each column. This means that when you have a lot of "www" sites which require your email address it looks like this:

    https://www...  colinmkeith@gma...
    https://www...  colinmkeith@gma...
    https://www...  colinmkeith@gma...
    https://www...  colinmkeith@gma...


Searching does not help because you cannot see the part that was matched and you end up having to click the edit icon for each record in turn trying to iterate to the appropriate line.

This filtering adds a very simple text area into which a regexp pattern can be entered, and results not matching that pattern are hidden.
