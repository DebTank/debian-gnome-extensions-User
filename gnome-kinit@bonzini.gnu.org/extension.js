// copyright (C) 2017 Paolo Bonzini
// License: GPLv2

const Lang = imports.lang;
const Signals = imports.signals;

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const St = imports.gi.St;

const ObjectManager = imports.misc.objectManager;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Meta = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext.domain('gnome-online-accounts');
const _ = Gettext.gettext;

const AccountIface = '<node>						\
  <interface name="org.gnome.OnlineAccounts.Account">			\
    <property name="AttentionNeeded" type="b" access="read"/>		\
    <property name="Id" type="s" access="read"/>			\
    <property name="PresentationIdentity" type="s" access="read"/>	\
    <property name="TicketingDisabled" type="b" access="readwrite"/>	\
    <method name="EnsureCredentials">					\
      <arg name="expires_in" type="i" direction="out"/>			\
    </method>								\
  </interface>								\
</node>';

const TicketingIface = '<node>						\
  <interface name="org.gnome.OnlineAccounts.Ticketing">			\
    <method name="GetTicket"/>						\
  </interface>								\
</node>';


let _accountManager = null;
let iconsPath = null;

function getAccountManager() {
    if (_accountManager == null)
        _accountManager = new AccountManager();

    return _accountManager;
}

const AccountManager = new Lang.Class({
    Name: 'AccountManager',
    _init: function() {
        this._accounts = {};
        this._objectManager = new ObjectManager.ObjectManager({ connection: Gio.DBus.session,
                                                                name: "org.gnome.OnlineAccounts",
                                                                objectPath: '/org/gnome/OnlineAccounts',
                                                                knownInterfaces: [ AccountIface, TicketingIface ],
                                                                onLoaded: Lang.bind(this, this._onLoaded) });
    },

    _onLoaded: function() {
        let accounts = this._objectManager.getProxiesForInterface('org.gnome.OnlineAccounts.Account');

        for (let i = 0; i < accounts.length; i++)
            this._addAccount(accounts[i]);

        this._objectManager.connect('interface-added', Lang.bind(this, function(objectManager, interfaceName, proxy) {
            if (interfaceName == 'org.gnome.OnlineAccounts.Account')
                this._addAccount(proxy);
        }));

        this._objectManager.connect('interface-removed', Lang.bind(this, function(objectManager, interfaceName, proxy) {
            if (interfaceName == 'org.gnome.OnlineAccounts.Account')
                this._removeAccount(proxy);
        }));
    },

    _removeAccountByPath: function(objectPath) {
        let account = this._accounts[objectPath];
        delete this._accounts[objectPath];
        this.emit('account-removed', account);
    },

    _addAccount: function(account) {
        let objectPath = account.get_object_path();

        if (objectPath in this._accounts) {
            if (this._accounts[objectPath] == account) {
                return;
            }
            this._removeAccountByPath(objectPath);
        }
        if (!account.TicketingDisabled ||
            account.getTicketingProxy(account) == null) {
            this._accounts[objectPath] = account;
            this.emit('account-added', account);
        }
    },

    _removeAccount: function(account) {
        let objectPath = account.get_object_path();

        if (this._accounts[objectPath] == account) {
            this._removeAccountByPath(objectPath);
        }
    },

    getTicketingProxy: function(account) {
        let objectPath = account.get_object_path();
        return this._objectManager.getProxy(objectPath, 'org.gnome.OnlineAccounts.Ticketing');
    },

    getAccounts: function() {
        let accounts = this._accounts;
        return Object.keys(accounts).map(function(k) {
            return accounts[k];
        });
    },

    hasAccounts: function() {
        return Object.keys(this._accounts).length > 0;
    },

    refreshAccounts: function() {
        for (let objectPath in this._accounts) {
            let account = this._accounts[objectPath];
            if (!account.AttentionNeeded) {
                account.EnsureCredentialsSync();
            }
        }
    }
});

Signals.addSignalMethods(AccountManager.prototype);

const AccountUI = new Lang.Class({
    Name: 'AccountUI',

    _init: function(account) {
        this._account = account;
        this._ticketing = getAccountManager().getTicketingProxy(account);
        this._buildUI();
    },

    _clicked: function() {
        if (!this.menuItem.state) {
            return;
        }
        // they clicked "off"
        if (this._account.AttentionNeeded) {
            this._ticketing.GetTicketRemote();
        }
        // make it "off" again
        this.menuItem.toggle();
    },

    _buildUI: function() {
        this.menuItem = new PopupMenu.PopupSwitchMenuItem(this._account.PresentationIdentity, false);
        this.menuItem.connect('toggled', Lang.bind(this, this._clicked));
    },

    destroy: function() {
        this.menuItem.destroy();
    },

    sync: function() {
        if (this._account.AttentionNeeded) {
            this.menuItem.setStatus(null);
        } else {
            // ??? show time of validity?
            this.menuItem.setStatus('\u2714');
        }
    }
});


// TODO: when AttentionNeeded state changes, add an icon to the system menu?
// (key + exclamation mark? too cluttered?)

const AccountMenu = new Lang.Class({
    Name: 'AccountMenu',

    _init: function() {
         this._buildUI();
         this._accountUIs = {}
         this._accountAdded = getAccountManager().connect('account-added', Lang.bind(this, this._addAccount));
         this._accountRemoved = getAccountManager().connect('account-removed', Lang.bind(this, this._removeAccount));

         let accounts = getAccountManager().getAccounts();
         for (let i in accounts) {
              this._addAccount(getAccountManager(), accounts[i]);
         }
     },

    _buildUI: function() {
        // use a separate PopupMenuSection for future extensibility
        this._accountSection = new PopupMenu.PopupMenuSection();

        this.item = new PopupMenu.PopupSubMenuMenuItem(_('Enterprise Login (Kerberos)'), true);
        this.item = new PopupMenu.PopupSubMenuMenuItem('Enterprise login (Kerberos)', true);
        this.item.icon.style_class = 'system-menu-kerberos-icon';
        this.item.icon.gicon = Gio.icon_new_for_string(iconsPath + '/system-menu-kerberos-22x22.png');
        this.item.menu.connect('open-state-changed', Lang.bind(this, this._subMenuOpenStateChanged));
        this.item.menu.addMenuItem(this._accountSection);
    },

    _sync: function() {
        // TODO: sort items
        this.item.actor.visible = getAccountManager().hasAccounts();
    },

    _addAccount: function(accountManager, account) {
        let objectPath = account.get_object_path();
        let accountUI = new AccountUI(account);
        this._accountUIs[objectPath] = accountUI;
        this._accountSection.addMenuItem(accountUI.menuItem, 0);
        this._sync();
    },

    _removeAccount: function(accountManager, account) {
        let objectPath = account.get_object_path();
        if (objectPath in this._accountUIs) {
            this._accountUIs[objectPath].destroy();
            delete this._accountUIs[objectPath];
        }
        this._sync();
    },

    destroy: function() {
        this.item.destroy();
        getAccountManager().disconnect(this._accountAdded);
        getAccountManager().disconnect(this._accountRemoved);
    },

    _subMenuOpenStateChanged: function(menu, open) {
        if (!open) {
            return;
        }

        getAccountManager().refreshAccounts();
        for (let objectPath in this._accountUIs) {
             this._accountUIs[objectPath].sync();
        }
    }
});

let _accountMenu;

function init() {
    // Gtk.IconTheme.get_default().append_search_path(iconsPath);
    iconsPath = Meta.dir.get_child('icons').get_path();
}

function enable() {
    _accountMenu = new AccountMenu();
    let systemMenu = Main.panel.statusArea['aggregateMenu'];
    systemMenu.menu.addMenuItem(_accountMenu.item, 3);
}

function disable() {
    _accountMenu.destroy();
    _accountMenu = null;
}
